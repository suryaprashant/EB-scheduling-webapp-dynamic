# EB Scheduling Web App

The repository is organized as a small frontend/backend application:

```text
frontend/   React, Vite, static assets, and frontend/.env
backend/    Python API, SCIP model, and backend/.env
scripts/    Commands to start either service or both
docs/       Original GAMS model references
```

The React app reads the bundled GAMS bus table and submits it to the Python
API. The API solves a sparse, mathematically equivalent translation of
`Rohini2.gms` using SCIP through PySCIPOpt. The GAMS runtime is not required.

## Run

```bash
npm install
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
npm run dev
```

`npm run dev` starts **both** services. Open <http://localhost:3001> for the
frontend; the Vite `/api` proxy forwards optimization requests to the backend
at <http://localhost:8000>. To run them separately, use two terminals:

```bash
npm run dev:web
npm run dev:api
```

The frontend's settings live in [`frontend/.env.example`](./frontend/.env.example)
and the backend's settings live in [`backend/.env.example`](./backend/.env.example).
Copy each example to the corresponding `.env` file and change the values there.
These local `.env` files are ignored by Git. The dev script automatically uses
the root `.venv` when it exists. On Windows, create it with `py -m venv .venv`
and activate it with `.venv\Scripts\activate` before installing the Python
requirements.

## Environment variables

| File | Variable | Purpose |
| --- | --- | --- |
| `frontend/.env` | `VITE_API_BASE_URL` | Backend HTTPS origin in production; leave empty locally to use the Vite proxy |
| `frontend/.env` | `VITE_DEV_HOST`, `VITE_DEV_PORT` | Frontend development/preview bind address and port |
| `frontend/.env` | `VITE_API_PROXY_TARGET` | Local Python API target for Vite's `/api` proxy |
| `backend/.env` | `HOST`, `PORT` | Python API bind address and port |
| `backend/.env` | `CORS_ALLOWED_ORIGIN` | Browser origin allowed to call the API |
| `backend/.env` | `SCHEDULE_TIME_LIMIT_SECONDS`, `SCHEDULE_MIP_GAP` | SCIP time limit and relative optimality gap |
| `backend/.env` | `SCHEDULE_CACHE_FILE` | Optional cache-file location |

Only put public, non-secret settings in `frontend/.env`: Vite embeds `VITE_*`
values in the browser bundle. Keep server-only settings in `backend/.env`.

Use **Import schedule data** to replace the bundled input with a GAMS `.inc`
bus table or an Excel workbook containing a `Sheet3` worksheet. The input is
replaced, not merged, and optimization reruns after a successful import.
Identical requests arriving during a solve share one optimizer run. The last
successful feasible or optimal result is cached locally by input data and
model version, so a refresh or service restart with the same input reuses it.
Importing different data triggers a new solve and replaces the cache.

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

The default input is [`frontend/public/data/roh-gams-bus-table.inc`](./frontend/public/data/roh-gams-bus-table.inc),
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
requests (for example, a VM or Python container service).

For a Cloudflare Pages build, set `VITE_API_BASE_URL` in the Pages build
environment to the backend's HTTPS origin, such as
`https://schedule-api.example.com`. Set `CORS_ALLOWED_ORIGIN` in the backend's
environment to the Pages site origin, such as
`https://your-project.pages.dev`. Locally, leave `VITE_API_BASE_URL` empty; the
Vite dev server uses `VITE_API_PROXY_TARGET` to proxy `/api` to the backend.

The backend reads `HOST`, `PORT`, `CORS_ALLOWED_ORIGIN`,
`SCHEDULE_TIME_LIMIT_SECONDS`, and `SCHEDULE_MIP_GAP` from `backend/.env` (or
the hosting provider's environment settings). For deployment, set `HOST=0.0.0.0`
and `PORT` to the port required by the provider. Install dependencies with
`pip install -r backend/requirements.txt` and start the API using
`python backend/server.py`. Configure the provider's request timeout to exceed
the solver's configured limit. The backend cache is stored under
`backend/.cache`; mount persistent storage there to retain cached schedules
across backend restarts. The frontend build output is `frontend/dist`. Do not
deploy only the frontend and expect optimization to work without the Python API.
