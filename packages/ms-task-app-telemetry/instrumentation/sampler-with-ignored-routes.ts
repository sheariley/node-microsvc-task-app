import { type Attributes, type Context, SpanKind } from '@opentelemetry/api'
import { type Sampler, SamplingDecision, type SamplingResult } from '@opentelemetry/sdk-trace-base'

export class SamplerWithIgnoredRoutes implements Sampler {
  constructor(private ignoredRoutes: string[] = ['/ping']) {}

  shouldSample(
    _context: Context,
    _traceId: string,
    _spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes
  ): SamplingResult {
    return {
      decision:
        !!attributes['http.target'] &&
        this.ignoredRoutes.includes(attributes['http.target'].toString())
          ? SamplingDecision.NOT_RECORD
          : SamplingDecision.RECORD_AND_SAMPLED,
    }
  }

  toString(): string {
    return 'Sampler With Ignored Routes'
  }
}
