import { type Attributes, type Context, type Link, SpanKind } from '@opentelemetry/api'
import {
  AlwaysOnSampler,
  type Sampler,
  SamplingDecision,
  type SamplingResult
} from '@opentelemetry/sdk-trace-base'
import { ATTR_HTTP_TARGET } from '@opentelemetry/semantic-conventions/incubating'

export class SamplerWithIgnoredRoutes implements Sampler {
  constructor(
    private ignoredRoutes: string[] = ['/ping'],
    private delegate?: Sampler
  ) {
    if (!this.delegate)
      this.delegate = new AlwaysOnSampler()
  }

  shouldSample(
    _context: Context,
    _traceId: string,
    _spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes,
    _links: Link[]
  ): SamplingResult {
    if (
      attributes &&
      attributes[ATTR_HTTP_TARGET] &&
      this.ignoredRoutes.some(route => attributes[ATTR_HTTP_TARGET]!.toString().startsWith(route))
    ) {
      return { decision: SamplingDecision.NOT_RECORD }
    }

    // fallback to delegate
    if (this.delegate) {
      return this.delegate.shouldSample(
        _context,
        _traceId,
        _spanName,
        _spanKind,
        attributes,
        _links
      )
    }

    return { decision: SamplingDecision.RECORD_AND_SAMPLED }
  }

  toString(): string {
    return 'Sampler With Ignored Routes'
  }
}
