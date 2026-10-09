import hashlib
import json
import math
import os
import tempfile
import threading
from concurrent.futures import Future
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from dotenv import load_dotenv


load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

BUS_COUNT = 101
TIME_SLOTS = 288
TRIP_COUNT = 3
BATTERY_KWH = 360
CHARGER_KW = 240
EFFICIENCY = 0.92
DRIVE_KWH_PER_KM = 1.3
BIG_M = 0.00092
CHARGER_LIMIT = 16
MAX_BODY_BYTES = 2_000_000
MODEL_CACHE_VERSION = "rohini2-scip-v3"
SOLVER_TIME_LIMIT_SECONDS = float(os.environ.get("SCHEDULE_TIME_LIMIT_SECONDS", "600"))
SOLVER_MIP_GAP = float(os.environ.get("SCHEDULE_MIP_GAP", "0.0001"))
CORS_ALLOWED_ORIGIN = os.environ.get("CORS_ALLOWED_ORIGIN", "*")
CACHE_FILE = os.environ.get(
    "SCHEDULE_CACHE_FILE",
    os.path.join(os.path.dirname(__file__), ".cache", "schedule-result.json"),
)
SOLVE_LOCK = threading.Lock()
REQUESTS_LOCK = threading.Lock()
IN_FLIGHT_SOLVES = {}


class OptimizationError(RuntimeError):
    pass


class ModelBuilder:
    def __init__(self):
        self.costs = []
        self.lower_bounds = []
        self.upper_bounds = []
        self.integrality = []
        self.rows = []
        self.x = {}
        self.b = {}
        self.y = {}
        self.soc_arr = {}
        self.soc_dep = {}
        self.warm_start = None

    def add_variable(self, cost=0.0, upper=math.inf, binary=False):
        index = len(self.costs)
        self.costs.append(cost)
        self.lower_bounds.append(0.0)
        self.upper_bounds.append(1.0 if binary else upper)
        self.integrality.append(binary)
        return index

    def add_row(self, terms, lower=-math.inf, upper=math.inf):
        coefficients = {}
        for variable, coefficient in terms:
            if coefficient:
                coefficients[variable] = coefficients.get(variable, 0.0) + coefficient
        self.rows.append((coefficients, lower, upper))

    def solve(self):
        try:
            from pyscipopt import Model, SCIP_PARAMEMPHASIS, quicksum
        except ImportError as error:
            raise OptimizationError(
                "PySCIPOpt is required. Install backend/requirements.txt in the active Python environment."
            ) from error

        nonzero_count = sum(len(row[0]) for row in self.rows)
        print(
            f"SCIP model: {len(self.costs)} variables, {len(self.rows)} constraints, "
            f"{nonzero_count} nonzeros.",
            flush=True,
        )
        solver = Model("Rohini2")
        solver.hideOutput()
        solver.setEmphasis(SCIP_PARAMEMPHASIS.FEASIBILITY)
        solver.setParam("limits/time", SOLVER_TIME_LIMIT_SECONDS)
        solver.setParam("limits/gap", SOLVER_MIP_GAP)
        variables = [
            solver.addVar(
                name=f"v{index}",
                vtype="B" if binary else "C",
                ub=None if math.isinf(self.upper_bounds[index]) else self.upper_bounds[index],
            )
            for index, binary in enumerate(self.integrality)
        ]
        for index, (coefficients, lower, upper) in enumerate(self.rows):
            expression = quicksum(
                coefficient * variables[variable]
                for variable, coefficient in coefficients.items()
            )
            if lower == upper:
                solver.addCons(expression == lower, name=f"c{index}")
            else:
                if lower != -math.inf:
                    solver.addCons(expression >= lower, name=f"c{index}_lo")
                if upper != math.inf:
                    solver.addCons(expression <= upper, name=f"c{index}_up")
        solver.setObjective(
            quicksum(
                cost * variables[index]
                for index, cost in enumerate(self.costs)
                if cost
            ),
            "minimize",
        )
        if self.warm_start is not None:
            start = solver.createSol()
            for index, value in enumerate(self.warm_start):
                solver.setSolVal(start, variables[index], value)
            if not solver.addSol(start, free=True):
                print("SCIP rejected the feasible-start candidate; solving without it.", flush=True)
        solver.optimize()
        status = solver.getStatus()
        has_solution = solver.getNSols() > 0
        if status in {"optimal", "gaplimit"} and has_solution:
            result_status = "optimal"
        elif status == "timelimit" and has_solution:
            result_status = "feasible_time_limit"
        elif status == "timelimit":
            raise OptimizationError(
                "SCIP reached the 10-minute time limit without finding a feasible schedule."
            )
        else:
            raise OptimizationError(
                f"SCIP could not produce a usable Rohini2.gms solution (status: {status})."
            )

        active_slots = [
            (bus - 1) * TIME_SLOTS + slot - 1
            for (bus, slot), variable in self.x.items()
            if solver.getVal(variables[variable]) > 0.5
        ]
        mip_gap = float(solver.getGap())
        return {
            "status": result_status,
            "activeSlots": active_slots,
            "objectiveValue": float(solver.getObjVal()),
            "mipGap": mip_gap if math.isfinite(mip_gap) else None,
        }


def tariff_at(slot):
    if slot <= 73:
        return 4
    if slot <= 120:
        return 5
    if slot <= 157:
        return 6
    if slot <= 216:
        return 5
    if slot <= 253:
        return 6
    return 5


def build_and_solve(input_buses):
    rows_by_bus = {row["bus"]: row for row in input_buses}
    buses = [
        rows_by_bus.get(
            bus,
            {
                "bus": bus,
                "departure1": 0,
                "arrival1": 0,
                "departure2": 0,
                "arrival2": 0,
                "distance1": 0,
                "distance2": 0,
            },
        )
        for bus in range(1, BUS_COUNT + 1)
    ]
    model = ModelBuilder()
    parameters = [trip_parameters(bus) for bus in buses]
    slot_windows = [trip_slot_windows(parameter) for parameter in parameters]

    for bus in range(1, BUS_COUNT + 1):
        charge_slots, boundary_slots = slot_windows[bus - 1]
        relevant_x_slots = {slot for slots in charge_slots for slot in slots}
        relevant_y_slots = {slot for slots in boundary_slots for slot in slots}
        relevant_x_slots.update(relevant_y_slots)
        for slot in relevant_y_slots:
            if slot < TIME_SLOTS:
                relevant_x_slots.add(slot + 1)
        for slot in sorted(relevant_x_slots):
            model.x[bus, slot] = model.add_variable(
                cost=tariff_at(slot) * CHARGER_KW * 5 / 60,
                binary=True,
            )
        for trip in range(1, TRIP_COUNT + 1):
            model.b[bus, trip] = model.add_variable(binary=True)
            model.soc_arr[bus, trip] = model.add_variable()
            model.soc_dep[bus, trip] = model.add_variable()
        for slot in sorted(relevant_y_slots):
            model.y[bus, slot] = model.add_variable()
    charging_slots = add_charging_constraints(model, parameters, slot_windows)
    add_soc_constraints(model, parameters, charging_slots)
    add_transition_constraints(model)
    add_capacity_constraints(model)
    model.warm_start = build_feasible_start(model, buses, parameters, slot_windows)
    return model.solve()


def build_feasible_start(model, buses, parameters, slot_windows):
    print("Building a constraint-checked SCIP start candidate.", flush=True)
    try:
        from pyscipopt import Model, SCIP_PARAMEMPHASIS, quicksum
    except ImportError as error:
        print(f"SCIP start generation unavailable: {error}", flush=True)
        return None

    charge_step = EFFICIENCY * CHARGER_KW / 60 / BATTERY_KWH * 5
    start_model = Model("Rohini2_start_charge1")
    start_model.hideOutput()
    start_model.setEmphasis(SCIP_PARAMEMPHASIS.FEASIBILITY)
    start_model.setParam("limits/time", 60.0)
    options_by_bus = {}
    start_options = []

    for bus, (data, parameter, windows) in enumerate(
        zip(buses, parameters, slot_windows, strict=True),
        start=1,
    ):
        charge_slots = windows[0]
        arrival1 = 0.9 - DRIVE_KWH_PER_KM * data["distance1"] / BATTERY_KWH
        energy2 = DRIVE_KWH_PER_KM * data["distance2"] / BATTERY_KWH
        if arrival1 < 0.2 - 1e-8:
            print(f"No warm-start candidate: bus {bus} arrives below its SOC minimum.", flush=True)
            return None

        max_charge1 = min(
            len(charge_slots[0]),
            int((parameter["recovery"][0] + 5) // 5),
        )
        candidate_patterns = []
        for count in [0, *range(2, max_charge1 + 1)]:
            departure2 = arrival1 + charge_step * max(0, count - 1)
            arrival2 = departure2 - energy2
            if departure2 > 1 + 1e-8 or arrival2 < 0.2 - 1e-8:
                continue
            if parameter["final_trip"] == 2 and departure2 < 0.92 - 1e-8:
                continue

            max_charge2 = min(
                len(charge_slots[1]),
                int((parameter["recovery"][1] + 5) // 5),
            )
            if parameter["recovery"][1] <= 0 or arrival2 >= 0.92 - 1e-8:
                count2 = 0
            else:
                count2 = max(2, math.ceil((0.92 - arrival2) / charge_step - 1e-10) + 1)
            if count2 > max_charge2:
                continue
            departure3 = arrival2 + charge_step * max(0, count2 - 1)
            if departure3 > 1 + 1e-8:
                continue

            if count == 0:
                starts = [None]
            else:
                starts = [
                    slot
                    for slot in range(charge_slots[0][0], charge_slots[0][-1] - count + 2)
                ]
            for slot in starts:
                record = {
                    "bus": bus,
                    "count1": count,
                    "start1": slot,
                    "count2": count2,
                    "release2": charge_slots[1][0] if charge_slots[1] else 0,
                    "departure2": departure2,
                    "arrival2": arrival2,
                    "departure3": departure3,
                }
                variable = start_model.addVar(
                    name=f"b{bus}_q{count}_s{slot if slot is not None else 0}",
                    vtype="B",
                )
                candidate_patterns.append((record, variable))
                start_options.append((record, variable))

        if not candidate_patterns:
            print(f"No warm-start charge pattern is feasible for bus {bus}.", flush=True)
            return None
        options_by_bus[bus] = candidate_patterns
        start_model.addCons(quicksum(variable for _, variable in candidate_patterns) == 1)

    for slot in range(1, TIME_SLOTS + 1):
        terms = [
            variable
            for record, variable in start_options
            if record["start1"] is not None
            and record["start1"] <= slot < record["start1"] + record["count1"]
        ]
        if terms:
            start_model.addCons(quicksum(terms) <= CHARGER_LIMIT)

    start_model.setObjective(
        quicksum(
            (
                record["count2"] * (1 + record["release2"] / TIME_SLOTS)
                + record["count1"] * 0.001
            )
            * variable
            for record, variable in start_options
        ),
        "minimize",
    )
    start_model.optimize()
    if start_model.getNSols() == 0:
        print("No charge-period warm-start candidate was found.", flush=True)
        return None

    selected = {}
    first_period_load = [0] * (TIME_SLOTS + 1)
    solution = start_model.getBestSol()
    for record, variable in start_options:
        if start_model.getSolVal(solution, variable) <= 0.5:
            continue
        bus = record["bus"]
        selected[bus] = record
        start = record["start1"]
        if start is not None:
            for slot in range(start, start + record["count1"]):
                first_period_load[slot] += 1

    second_model = Model("Rohini2_start_charge2")
    second_model.hideOutput()
    second_model.setEmphasis(SCIP_PARAMEMPHASIS.FEASIBILITY)
    second_model.setParam("limits/time", 60.0)
    second_options = []
    options2_by_bus = {}
    for bus, record in selected.items():
        count = record["count2"]
        if count == 0:
            continue
        slots = slot_windows[bus - 1][0][1]
        starts = range(slots[0], slots[-1] - count + 2)
        candidates = []
        for slot in starts:
            variable = second_model.addVar(
                name=f"b{bus}_s{slot}",
                vtype="B",
            )
            option = (bus, slot, count, variable)
            candidates.append(option)
            second_options.append(option)
        if not candidates:
            print(f"No second-period warm-start slot fits bus {bus}.", flush=True)
            return None
        options2_by_bus[bus] = candidates
        second_model.addCons(quicksum(option[3] for option in candidates) == 1)

    for slot in range(1, TIME_SLOTS + 1):
        terms = [
            variable
            for _, start, count, variable in second_options
            if start <= slot < start + count
        ]
        if terms:
            second_model.addCons(
                quicksum(terms) <= CHARGER_LIMIT - first_period_load[slot]
            )
    second_model.setObjective(
        quicksum(
            tariff_at(slot) * CHARGER_KW * 5 / 60 * variable
            for _, start, count, variable in second_options
            for slot in range(start, start + count)
        ),
        "minimize",
    )
    second_model.optimize()
    if second_model.getNSols() == 0:
        print("No second charge-period warm-start candidate was found.", flush=True)
        return None

    second_solution = second_model.getBestSol()
    selected_starts = {
        bus: start
        for bus, start, _, variable in second_options
        if second_model.getSolVal(second_solution, variable) > 0.5
    }
    values = [0.0] * len(model.costs)
    for bus, record in selected.items():
        start1 = record["start1"]
        if start1 is not None:
            for slot in range(start1, start1 + record["count1"]):
                values[model.x[bus, slot]] = 1.0
        start2 = selected_starts.get(bus)
        if start2 is not None:
            for slot in range(start2, start2 + record["count2"]):
                values[model.x[bus, slot]] = 1.0

        counts = (record["count1"], record["count2"], 0)
        for trip, count in enumerate(counts, start=1):
            values[model.b[bus, trip]] = 0.0 if count else 1.0
        energy1 = DRIVE_KWH_PER_KM * buses[bus - 1]["distance1"] / BATTERY_KWH
        energy2 = DRIVE_KWH_PER_KM * buses[bus - 1]["distance2"] / BATTERY_KWH
        arrival1 = 0.9 - energy1
        departure2 = record["departure2"]
        arrival2 = record["arrival2"]
        departure3 = record["departure3"]
        soc_arrivals = (arrival1, arrival2, 0.2)
        soc_departures = (0.9, departure2, departure3)
        for trip, value in enumerate(soc_arrivals, start=1):
            values[model.soc_arr[bus, trip]] = value
        for trip, value in enumerate(soc_departures, start=1):
            values[model.soc_dep[bus, trip]] = value

    for (bus, slot), variable in model.y.items():
        current = values[model.x[bus, slot]]
        following = values[model.x[bus, slot + 1]] if slot < TIME_SLOTS else 0.0
        values[variable] = abs(following - current)

    y_use_count = {}
    for bus, (_, boundary_slots) in enumerate(slot_windows, start=1):
        for boundary in boundary_slots:
            for slot in boundary:
                y_use_count[bus, slot] = y_use_count.get((bus, slot), 0) + 1
    for bus, (charge_slots, boundary_slots) in enumerate(slot_windows, start=1):
        for trip, boundary in enumerate(boundary_slots, start=1):
            required = 2 * (1 - values[model.b[bus, trip]])
            assigned = sum(values[model.y[bus, slot]] for slot in boundary)
            if assigned > required + 1e-8:
                print(
                    f"Warm-start candidate has too many transitions for bus {bus}, trip {trip}: "
                    f"{assigned} exceeds {required}; selected={selected.get(bus)}.",
                    flush=True,
                )
                return None
            slack = required - assigned
            if slack > 1e-8:
                candidates = [
                    slot
                    for slot in boundary
                    if y_use_count.get((bus, slot), 1) == 1
                ]
                if not candidates:
                    print(
                        f"Warm-start candidate has no free transition slot for bus {bus}, trip {trip}.",
                        flush=True,
                    )
                    return None
                values[model.y[bus, candidates[0]]] += slack

    for row_index, (coefficients, lower, upper) in enumerate(model.rows):
        activity = sum(values[variable] * coefficient for variable, coefficient in coefficients.items())
        if activity < lower - 1e-7 or activity > upper + 1e-7:
            print(
                f"Warm-start candidate violates model row {row_index}: "
                f"value={activity}, bounds=[{lower}, {upper}].",
                flush=True,
            )
            return None
    print("Validated and loaded a feasible SCIP MIP-start candidate.", flush=True)
    return values


def trip_parameters(bus):
    has_second_trip = bus["departure2"] > 0
    recovery1 = (
        (bus["departure2"] - bus["arrival1"]) * 5
        if has_second_trip
        else (TIME_SLOTS - bus["departure1"]) * 5
    )
    recovery2 = (TIME_SLOTS - bus["arrival2"]) * 5 if has_second_trip else 0
    recovery = [recovery1, recovery2, 0]
    final_trip = next(index for index, value in enumerate(recovery, start=1) if value == 0)
    return {
        "stop": [bus["arrival1"], bus["arrival2"], 0],
        "recovery": recovery,
        "distance": [bus["distance1"], bus["distance2"], 0],
        "final_trip": final_trip,
    }


def trip_slot_windows(parameter):
    charge_slots_by_trip = []
    boundary_slots_by_trip = []
    for trip in range(1, TRIP_COUNT + 1):
        recovery = parameter["recovery"][trip - 1]
        stop = parameter["stop"][trip - 1]
        charge_slots_by_trip.append(
            [
                slot
                for slot in range(1, TIME_SLOTS + 1)
                if stop + 1 <= slot <= stop + (recovery + 5) / 5
            ]
        )
        boundary_slots_by_trip.append(
            [
                slot
                for slot in range(1, TIME_SLOTS + 1)
                if stop <= slot <= stop + (recovery + 5) / 5
            ]
        )
    return charge_slots_by_trip, boundary_slots_by_trip


def add_charging_constraints(model, parameters, slot_windows):
    all_charging_slots = {}
    for bus, (charge_slots_by_trip, boundary_slots_by_trip) in enumerate(slot_windows, start=1):
        for trip in range(1, TRIP_COUNT + 1):
            recovery = parameters[bus - 1]["recovery"][trip - 1]
            binary = model.b[bus, trip]
            charge_slots = charge_slots_by_trip[trip - 1]
            boundary_slots = boundary_slots_by_trip[trip - 1]
            all_charging_slots[bus, trip] = charge_slots
            active_terms = [(model.x[bus, slot], 1) for slot in charge_slots]
            model.add_row(
                [(variable, 5) for variable, _ in active_terms] + [(binary, 5)],
                upper=recovery + 5,
            )
            model.add_row(
                active_terms + [(binary, (recovery + 5) / 5)],
                upper=(recovery + 5) / 5,
            )
            model.add_row(
                [(variable, 5 * BIG_M) for variable, _ in active_terms]
                + [(binary, 1 + 5 * BIG_M)],
                upper=1 + 5 * BIG_M,
            )
            model.add_row(active_terms + [(binary, 2)], lower=2)
            model.add_row(
                [(model.y[bus, slot], 1) for slot in boundary_slots] + [(binary, 2)],
                lower=2,
                upper=2,
            )
    return all_charging_slots


def add_soc_constraints(model, parameters, charging_slots):
    charge_rate = EFFICIENCY * CHARGER_KW / 60 / BATTERY_KWH
    for bus, parameter in enumerate(parameters, start=1):
        model.add_row([(model.soc_dep[bus, 1], 1)], lower=0.9, upper=0.9)
        for trip in range(1, TRIP_COUNT + 1):
            minimum_departure = 0.92 if trip == parameter["final_trip"] else 0
            model.add_row(
                [(model.soc_arr[bus, trip], 1)],
                lower=0.2,
            )
            model.add_row(
                [(model.soc_dep[bus, trip], 1)],
                lower=minimum_departure,
            )

        for trip in range(1, TRIP_COUNT):
            arrival_soc = model.soc_arr[bus, trip]
            departure_soc = model.soc_dep[bus, trip]
            next_departure_soc = model.soc_dep[bus, trip + 1]
            energy_use = DRIVE_KWH_PER_KM * parameter["distance"][trip - 1] / BATTERY_KWH
            model.add_row(
                [(arrival_soc, 1), (departure_soc, -1)],
                lower=-energy_use,
                upper=-energy_use,
            )
            model.add_row(
                [
                    (next_departure_soc, 1),
                    (arrival_soc, -1),
                    *[
                        (model.x[bus, slot], -charge_rate * 5)
                        for slot in charging_slots[bus, trip]
                    ],
                    (model.b[bus, trip], -charge_rate * 5),
                ],
                lower=-charge_rate * 5,
                upper=-charge_rate * 5,
            )
            model.add_row([(next_departure_soc, 1)], upper=1)


def add_transition_constraints(model):
    for (bus, slot), transition in model.y.items():
        if slot == TIME_SLOTS:
            continue
        current = model.x[bus, slot]
        following = model.x[bus, slot + 1]
        model.add_row([(transition, 1), (current, 1), (following, -1)], lower=0)
        model.add_row([(transition, 1), (current, -1), (following, 1)], lower=0)


def add_capacity_constraints(model):
    for slot in range(1, TIME_SLOTS + 1):
        # GAMS N/Nchs imply this per-slot cap; ass/s1 is redundant under the 16 cap.
        model.add_row(
            [
                (variable, 1)
                for (bus, variable_slot), variable in model.x.items()
                if variable_slot == slot
            ],
            upper=CHARGER_LIMIT,
        )


def validate_input(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("buses"), list):
        raise ValueError("Request must contain a buses array.")
    buses = payload["buses"]
    if len(buses) > BUS_COUNT:
        raise ValueError(f"At most {BUS_COUNT} bus rows are supported by Rohini2.gms.")
    seen = set()
    required = (
        "bus",
        "departure1",
        "arrival1",
        "departure2",
        "arrival2",
        "distance1",
        "distance2",
    )
    for row in buses:
        if not isinstance(row, dict) or any(key not in row for key in required):
            raise ValueError("Each bus row must contain the seven GAMS bus-table columns.")
        bus = row["bus"]
        if not isinstance(bus, int) or isinstance(bus, bool) or not 1 <= bus <= BUS_COUNT:
            raise ValueError(f"Bus index must be an integer in 1-{BUS_COUNT}.")
        if bus in seen:
            raise ValueError(f"Bus {bus} appears more than once.")
        seen.add(bus)
        for key in required[1:]:
            value = row[key]
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
                raise ValueError(f"Bus {bus} has an invalid value in {key}.")
        for key in ("departure1", "arrival1", "departure2", "arrival2"):
            if not 0 <= row[key] <= TIME_SLOTS:
                raise ValueError(f"Bus {bus} has a time outside the 288-slot GAMS horizon.")
    return buses


def solve_once(buses):
    canonical_buses = sorted(buses, key=lambda row: row["bus"])
    request_key = hashlib.sha256(
        json.dumps(
            {"model": MODEL_CACHE_VERSION, "buses": canonical_buses},
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()

    with REQUESTS_LOCK:
        cached_result = read_cached_result(request_key)
        if cached_result is not None:
            print("Using cached Rohini2.gms schedule.", flush=True)
            return cached_result
        future = IN_FLIGHT_SOLVES.get(request_key)
        is_solver = future is None
        if is_solver:
            future = Future()
            IN_FLIGHT_SOLVES[request_key] = future

    if not is_solver:
        return future.result()

    try:
        print("Solving Rohini2.gms schedule...", flush=True)
        with SOLVE_LOCK:
            result = build_and_solve(canonical_buses)
        write_cached_result(request_key, result)
        future.set_result(result)
        print(
            f"Solved Rohini2.gms ({result['status']}): objective={result['objectiveValue']}, "
            f"MIP gap={result['mipGap']}, "
            f"active slots={len(result['activeSlots'])}",
            flush=True,
        )
        return result
    except Exception as error:
        future.set_exception(error)
        raise
    finally:
        with REQUESTS_LOCK:
            IN_FLIGHT_SOLVES.pop(request_key, None)


def read_cached_result(request_key):
    try:
        with open(CACHE_FILE, encoding="utf-8") as cache_file:
            entry = json.load(cache_file)
    except FileNotFoundError:
        return None
    except (OSError, json.JSONDecodeError) as error:
        print(f"Could not read schedule cache: {error}", flush=True)
        return None

    if not isinstance(entry, dict) or (
        entry.get("key") != request_key
        or not isinstance(entry.get("result"), dict)
        or entry["result"].get("status") not in {"optimal", "feasible_time_limit"}
    ):
        return None
    return entry["result"]


def write_cached_result(request_key, result):
    cache_dir = os.path.dirname(CACHE_FILE)
    try:
        os.makedirs(cache_dir, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=cache_dir,
            prefix=".schedule-result-",
            suffix=".tmp",
            delete=False,
        ) as cache_file:
            temp_path = cache_file.name
            json.dump({"key": request_key, "result": result}, cache_file)
        os.replace(temp_path, CACHE_FILE)
    except OSError as error:
        print(f"Could not persist schedule cache: {error}", flush=True)
        try:
            if "temp_path" in locals() and os.path.exists(temp_path):
                os.unlink(temp_path)
        except OSError as cleanup_error:
            print(f"Could not remove temporary schedule cache: {cleanup_error}", flush=True)


class ScheduleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/api/health":
            self.send_error(404)
            return
        self.send_json(200, {"status": "ok", "solver": "SCIP"})

    def do_POST(self):
        if self.path != "/api/schedule":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("Request body is empty or exceeds the size limit.")
            payload = json.loads(self.rfile.read(length))
            buses = validate_input(payload)
            result = solve_once(buses)
            self.send_json(200, result)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except OptimizationError as error:
            print(f"Optimization failed: {error}", flush=True)
            self.send_json(503, {"error": str(error)})
        except Exception as error:
            print(f"Unexpected schedule API error: {error!r}", flush=True)
            self.send_json(500, {"error": str(error)})

    def do_OPTIONS(self):
        if self.path != "/api/schedule":
            self.send_error(404)
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", CORS_ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def send_json(self, status, value):
        data = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", CORS_ALLOWED_ORIGIN)
        self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format_string, *args):
        print(format_string % args)


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), ScheduleHandler)
    print(f"Rohini2.gms SCIP API listening on http://{host}:{port}")
    server.serve_forever()
