/**
 * Mock shim for chrome-devtools-frontend during Jest testing.
 *
 * The actual chrome-devtools-frontend package is complex and has many dependencies
 * that don't work well in Jest test environment. This mock provides empty implementations
 * for testing purposes.
 */

// Mock trace engine
export const TraceEngine = {
  Handlers: {},
  ModelHelpers: {},
  TraceProcessor: {},
};

// Mock formatters
export class PerformanceTraceFormatter {
  format() {
    return '';
  }
}

export class PerformanceInsightFormatter {
  format() {
    return '';
  }
}

export const AgentFocus = {
  Latency: 'latency',
  Responsiveness: 'responsiveness',
  Throughput: 'throughput',
};

// Default export for module compatibility
export default {
  TraceEngine,
  PerformanceTraceFormatter,
  PerformanceInsightFormatter,
  AgentFocus,
};
