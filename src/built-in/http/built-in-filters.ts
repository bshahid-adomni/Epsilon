import { Logger } from '@bitblit/ratchet/dist/common/logger';
import { Context, ProxyResult } from 'aws-lambda';
import { StringRatchet } from '@bitblit/ratchet/dist/common/string-ratchet';
import { ExtendedAPIGatewayEvent } from '../../http/route/extended-api-gateway-event';
import { MapRatchet } from '@bitblit/ratchet/dist/common/map-ratchet';
import { EventUtil } from '../../http/event-util';
import { BadRequestError } from '../../http/error/bad-request-error';
import { FilterFunction } from '../../config/http/filter-function';
import { ResponseUtil } from '../../http/response-util';
import { EpsilonHttpError } from '../../http/error/epsilon-http-error';
import { FilterChainContext } from '../../config/http/filter-chain-context';

export class BuiltInFilters {
  public static readonly MAXIMUM_LAMBDA_BODY_SIZE_BYTES: number = 1024 * 1024 * 5 - 1024 * 100; // 5Mb - 100k buffer

  public static async combineFilters(fCtx: FilterChainContext, filters: FilterFunction[]): Promise<boolean> {
    let cont: boolean = true;
    if (filters && filters.length > 0) {
      for (let i = 0; i < filters.length && cont; i++) {
        cont = await filters[i](fCtx);
      }
    }
    return cont;
  }

  public static async applyGzipIfPossible(fCtx: FilterChainContext): Promise<boolean> {
    if (fCtx.event?.headers && fCtx.result) {
      const encodingHeader: string =
        fCtx.event && fCtx.event.headers ? MapRatchet.extractValueFromMapIgnoreCase(fCtx.event.headers, 'accept-encoding') : null;
      fCtx.result = await ResponseUtil.applyGzipIfPossible(encodingHeader, fCtx.result);
    }
    return true;
  }

  public static async addConstantHeaders(fCtx: FilterChainContext, headers: Record<string, string>): Promise<boolean> {
    if (headers && fCtx.result) {
      fCtx.result.headers = Object.assign({}, headers, fCtx.result.headers);
    } else {
      Logger.warn('Could not add headers - either result or headers were missing');
    }
    return true;
  }

  public static async addAWSRequestIdHeader(fCtx: FilterChainContext, headerName: string = 'X-REQUEST-ID'): Promise<boolean> {
    if (fCtx.result && StringRatchet.trimToNull(headerName) && headerName.startsWith('X-')) {
      fCtx.result.headers = fCtx.result.headers || {};
      fCtx.result.headers[headerName] = fCtx.context?.awsRequestId || 'Request-Id-Missing';
    } else {
      Logger.warn('Could not add request id header - either result or context were missing or name was invalid');
    }
    return true;
  }

  public static async addAllowEverythingCORSHeaders(fCtx: FilterChainContext): Promise<boolean> {
    return BuiltInFilters.addConstantHeaders(fCtx, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    });
  }

  public static async addAllowReflectionCORSHeaders(fCtx: FilterChainContext): Promise<boolean> {
    return BuiltInFilters.addConstantHeaders(fCtx, {
      'Access-Control-Allow-Origin': MapRatchet.caseInsensitiveAccess<string>(fCtx.event.headers, 'Origin') || '*',
      'Access-Control-Allow-Methods': MapRatchet.caseInsensitiveAccess<string>(fCtx.event.headers, 'Access-Control-Request-Headers') || '*',
      'Access-Control-Allow-Headers': MapRatchet.caseInsensitiveAccess<string>(fCtx.event.headers, 'Access-Control-Request-Method') || '*',
    });
  }

  public static async fixStillEncodedQueryParameters(fCtx: FilterChainContext): Promise<boolean> {
    EventUtil.fixStillEncodedQueryParams(fCtx.event);
    return true;
  }

  public static async disallowStringNullAsPathParameter(fCtx: FilterChainContext): Promise<boolean> {
    if (fCtx?.event?.pathParameters) {
      Object.keys(fCtx.event.pathParameters).forEach((k) => {
        if ('null' === StringRatchet.trimToEmpty(fCtx.event.pathParameters[k]).toLowerCase()) {
          throw new BadRequestError().withFormattedErrorMessage('Path parameter %s was string -null-', k);
        }
      });
    }
    return true;
  }

  public static async disallowStringNullAsQueryStringParameter(fCtx: FilterChainContext): Promise<boolean> {
    if (fCtx?.event?.queryStringParameters) {
      Object.keys(fCtx.event.queryStringParameters).forEach((k) => {
        if ('null' === StringRatchet.trimToEmpty(fCtx.event.queryStringParameters[k]).toLowerCase()) {
          throw new BadRequestError().withFormattedErrorMessage('Path parameter %s was string -null-', k);
        }
      });
    }
    return true;
  }

  public static async ensureEventMaps(fCtx: FilterChainContext): Promise<boolean> {
    fCtx.event.queryStringParameters = fCtx.event.queryStringParameters || {};
    fCtx.event.headers = fCtx.event.headers || {};
    fCtx.event.pathParameters = fCtx.event.pathParameters || {};
    return true;
  }

  public static async parseBodyObject(fCtx: FilterChainContext): Promise<boolean> {
    if (fCtx.event?.body) {
      fCtx.event.parsedBody = EventUtil.bodyObject(fCtx.event);
    }
    return true;
  }

  public static async checkMaximumLambdaBodySize(fCtx: FilterChainContext): Promise<boolean> {
    if (fCtx.result?.body && fCtx.result.body.length > BuiltInFilters.MAXIMUM_LAMBDA_BODY_SIZE_BYTES) {
      const delta: number = fCtx.result.body.length - BuiltInFilters.MAXIMUM_LAMBDA_BODY_SIZE_BYTES;
      throw new EpsilonHttpError(
        'Response size is ' + fCtx.result.body.length + ' bytes, which is ' + delta + ' bytes too large for this handler'
      ).withHttpStatusCode(500);
    }
    return true;
  }

  public static defaultEpsilonPreFilters(): FilterFunction[] {
    return [
      (fCtx) => BuiltInFilters.ensureEventMaps(fCtx),
      (fCtx) => BuiltInFilters.parseBodyObject(fCtx),
      (fCtx) => BuiltInFilters.fixStillEncodedQueryParameters(fCtx),
      (fCtx) => BuiltInFilters.disallowStringNullAsPathParameter(fCtx),
      (fCtx) => BuiltInFilters.disallowStringNullAsQueryStringParameter(fCtx),
    ];
  }

  public static defaultEpsilonPostFilters(): FilterFunction[] {
    return [
      (fCtx) => BuiltInFilters.addAWSRequestIdHeader(fCtx),
      (fCtx) => BuiltInFilters.addAllowReflectionCORSHeaders(fCtx),
      (fCtx) => BuiltInFilters.applyGzipIfPossible(fCtx),
      (fCtx) => BuiltInFilters.checkMaximumLambdaBodySize(fCtx),
    ];
  }

  public static defaultEpsilonErrorFilters(): FilterFunction[] {
    return [(fCtx) => BuiltInFilters.addAWSRequestIdHeader(fCtx), (fCtx) => BuiltInFilters.addAllowReflectionCORSHeaders(fCtx)];
  }
}