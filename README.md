# EB Scheduling Web App — Dynamic

An independent React/Vite project that reads fleet trip data from the `Sheet3`
worksheet and dynamically builds charging sessions and charger assignments.
It does not use the preassigned session records from the original project.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3001>. The app loads the bundled GAMS bus table by
default. Use **Import schedule data** to load another `.inc` file or an `.xlsx`
or `.xls` workbook with a `Sheet3` worksheet.

## Expected workbook columns

The `Sheet3` worksheet uses row 1 as headers and one bus per row:

| Column | Value |
| --- | --- |
| B | `Bus_No.` |
| C / D | `Departure1` / `Arrival1` |
| E / F | `Departure2` / `Arrival2` (optional as a pair) |
| G / H | `nTrips1` / `nTrips2` distance in km |

Times may be Excel time fractions or `HH:mm` strings. The project also includes
`public/data/rohini-source.xlsx` as an alternate workbook input.

### GAMS include format

The app also accepts the `XLS2GMS` table format used by `Rohini.inc`. Each data
row starts with the bus index, followed by six numeric columns in the same
order used by `docs/Rohini.gms`: departure 1, arrival 1, departure 2, arrival
2, trip 1 distance, and trip 2 distance. Times are minutes after midnight;
zero trip-2 fields indicate that the bus has only one trip. Fractional minutes
are rounded to whole minutes for the app's five-minute scheduling grid.

## Optimization model and limits

The app computes the charging energy required between trips from SOC targets,
then solves a mixed-integer linear scheduling model with the HiGHS WebAssembly
solver in a browser worker. Binary variables select one five-minute-aligned
start time per charge job, while capacity constraints limit simultaneous
sessions to 20 chargers. It solves in two stages: first it maximizes the number
of jobs scheduled, then minimizes their time-of-use tariff cost. The resulting
sessions are assigned to charger IDs after optimization.
The required charge duration for each job is calculated before optimization
from the next trip's energy and the 20% arrival reserve, or the 90% overnight
target; the MIP optimizes when each job is charged, not the SOC target or
charge amount.

It uses the supplied GMS parameters where they are explicit:

- 360 kWh battery capacity and 1.3 kWh/km trip energy use
- 240 kW charger power and 92% charging efficiency
- 20% minimum arrival SOC and 90% initial/overnight SOC
- five-minute charging blocks and five-minute charging startup allowance
- the six time-of-use tariff rates defined in `docs/Rohini.gms`

The bundled include is the bus-table data source referenced by the GMS model
(the source names `Rohini1.inc`; the provided export is named `Rohini.inc`).
The browser model optimizes charge-job placement and charger capacity, but
does not reproduce the GMS formulation equation-for-equation: its charge
duration and SOC treatment differ. Any infeasible trip SOC,
unavailable charging window, or job omitted due to charger capacity is
reported in the UI. Optimization runs locally; no solver backend is required.

## Production build

```bash
npm run build
```

The built static app can be deployed to Cloudflare Pages with build command
`npm run build` and output directory `dist`.
