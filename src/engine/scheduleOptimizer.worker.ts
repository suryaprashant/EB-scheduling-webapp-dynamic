import loadHighs, { type LegacyHighsSolution } from 'highs';
import highsWasmUrl from 'highs/runtime?url';

interface OptimizationRequest {
  firstPassModel: string;
  secondPassModelTemplate: string;
  candidateCount: number;
  jobCount: number;
}

interface OptimizationResponse {
  scheduledCandidateIndices: number[];
  skippedJobIndices: number[];
}

self.addEventListener('message', event => {
  void optimize(event.data as OptimizationRequest);
});

async function optimize(request: OptimizationRequest): Promise<void> {
  try {
    const highs = await loadHighs({ locateFile: () => highsWasmUrl });
    const options = { output_flag: false, time_limit: 120, mip_rel_gap: 0 };
    const coverageResult = highs.solve(request.firstPassModel, options);
    requireOptimal(coverageResult, 'maximize scheduled charging jobs');

    const skippedJobIndices = Array.from({ length: request.jobCount }, (_, index) => index)
      .filter(index => primalValue(coverageResult, `skip_${index}`) > 0.5);
    const costModel = request.secondPassModelTemplate.replace(
      '__SKIPPED_COUNT__',
      String(skippedJobIndices.length),
    );
    const costResult = highs.solve(costModel, options);
    requireOptimal(costResult, 'minimize charging cost');

    const scheduledCandidateIndices = Array.from(
      { length: request.candidateCount },
      (_, index) => index,
    ).filter(index => primalValue(costResult, `x_${index}`) > 0.5);

    self.postMessage({ scheduledCandidateIndices, skippedJobIndices } satisfies OptimizationResponse);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'The schedule optimization failed.',
    });
  }
}

function requireOptimal(result: LegacyHighsSolution, phase: string): void {
  if (result.Status !== 'Optimal') {
    throw new Error(`HiGHS could not prove an optimal schedule while trying to ${phase} (status: ${result.Status}).`);
  }
}

function primalValue(result: LegacyHighsSolution, columnName: string): number {
  const column = result.Columns[columnName];
  return column && 'Primal' in column ? column.Primal : 0;
}
