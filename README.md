# EB Scheduling Web App

The app reads the bundled GAMS bus table and submits it to a local Python API.
That API solves a sparse, mathematically equivalent translation of the
`Rohini2.gms` mixed-integer model with SCIP through PySCIPOpt. The GAMS runtime
is not required.

## Run

```bash
npm install
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm run dev
```

The development command starts both the frontend and the solver API. Open
<http://localhost:3001>. Use **Import schedule data** to replace the
bundled input with a GAMS `.inc` bus table or an Excel workbook containing a
`Sheet3` worksheet. The input is replaced, not merged, and the optimization is
rerun after a successful import. Identical requests arriving while a solve is
in progress share that solve instead of queuing duplicate optimizer runs.
The last successful feasible or optimal result is cached locally by its input
data and model version. Refreshing the page or restarting the dev servers with
the same input reuses that result; importing different data triggers a new
optimization and replaces the cache.
The dev script automatically uses `.venv` when it exists. On Windows, create
the environment with `py -m venv .venv` and activate it with
`.venv\Scripts\activate` before installing the Python requirements.

## GAMS model parity

The backend encodes the variables, objective, and constraints in
[`docs/Rohini2.gms`](./docs/Rohini2.gms), including:

- 101 buses, three trip indices, and 288 five-minute time slots
- 20 charger assignments and the model's 16 simultaneous charger limit (the
  assignment binaries are projected out because the original limit already
  guarantees an assignment exists)
- The GAMS tariff periods and cost objective
- SOC arrival/departure equations, integer charge duration, startup binary,
  its exact linearization, charging-window and transition equations

The model is translated to a mathematically equivalent sparse mixed-integer
formulation for SCIP; it does not replace the GAMS objective with a heuristic
or a maximize-jobs objective. The GAMS model limits total simultaneous
charging but does not bind a bus to the same numbered charger across slots.
The UI now merges each bus's consecutive active slots into a charging session
and assigns one stable physical charger to that full interval. Since no more
than 16 buses charge simultaneously, interval coloring can assign these runs
to the 16 chargers without overlap. This display-level charger assignment does
not change the optimized charging slots or objective. If multiple optimal
schedules exist, SCIP may return a different but equally optimal schedule than
another GAMS MIP solver.
For tractability, charge-duration helper variables are algebraically eliminated
using their exact GAMS constraints; the feasible charging patterns, objective,
and SOC equations are preserved. Charging and transition variables are also
created only in slots that can participate in a charging-window or its
transition equations. Omitted charging variables have positive objective
coefficients and occur only in charger-capacity constraints or unconstrained
transition equations, so fixing them to zero preserves an optimal solution.
The GAMS duration variable is integer, and `mat1` equates its charging portion
to the number of active five-minute slots. Thus a trip that charges must use
at least two slots; the only one-slot minimum is the inactive `Tchg = 5` case.
Any SCIP MIP-start is checked against every row of the projected model before
it is given to the optimizer; it is only a starting incumbent, and SCIP
continues optimizing the original electricity-cost objective.

## Input formats

The default input is [`public/data/roh-gams-bus-table.inc`](./public/data/roh-gams-bus-table.inc),
the supplied `Roh.inc` data. Each data row contains a bus index followed by
six columns: departure 1, arrival 1, departure 2, arrival 2, trip 1 distance,
and trip 2 distance. Fractional time values are preserved, as they are used
directly by the GAMS model's time-slot equations.

Excel imports use row 1 as headers and one bus per row:

| Column | Value |
| --- | --- |
| B | `Bus_No.` |
| C / D | `Departure1` / `Arrival1` |
| E / F | `Departure2` / `Arrival2` (optional as a pair) |
| G / H | `nTrips1` / `nTrips2` distance in km |

Excel times may be time fractions or `HH:mm` strings. They are mapped to the
GAMS model's five-minute time-slot units.

## Optimization runtime

SCIP uses feasibility emphasis and a 0.01% relative MIP optimality tolerance.
A time limit, infeasible model, or solver error is reported to the UI. If the
10-minute time limit is reached after SCIP has found a feasible incumbent, that schedule is
shown with a clear warning and the solver's remaining MIP gap; it is not
presented as proven optimal. If no feasible incumbent exists, the UI reports
the failure without showing a schedule. Optimization failures are logged in the
terminal running `npm run dev` and returned as HTTP 503; unexpected API errors
are logged and returned as HTTP 500. This does not change the model's objective
or constraints.

The supplied 101-bus input has been tested end-to-end by the SCIP model builder:
it produced a feasible incumbent before the 10-minute limit, but the optimum
was not proven within that run.

## Production build

```bash
npm run build
```

The frontend build is static and can be deployed to Cloudflare Pages. Cloudflare
Pages does not run this project's Python/SCIP API: the optimizer must run as a
separate Python backend on a host that supports PySCIPOpt and long-running
requests (for example, a VM or a Python container service). Configure the
frontend build environment variable `VITE_API_BASE_URL` to that backend's
HTTPS origin, such as `https://schedule-api.example.com`, and allow the Pages
site's origin in the backend CORS policy by setting
`CORS_ALLOWED_ORIGIN=https://your-project.pages.dev`. Leave
`VITE_API_BASE_URL` empty for local development, where Vite proxies `/api` to
`localhost:8000`.

The backend listens on `0.0.0.0` when deployed with `HOST=0.0.0.0`; set `PORT`
to the port required by the hosting provider. Install Python dependencies with
`pip install -r backend/requirements.txt` and start the API with
`python backend/server.py`. Configure the provider's request timeout for the
solver's 10-minute limit. The backend cache is stored under `backend/.cache`;
mount persistent storage there if cached schedules should survive backend
restarts. Do not deploy only the static `dist` folder and expect optimization
to work without the Python API.
