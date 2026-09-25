/**
 * Every path parameter spelled as a uuid reaches its handler in lower case.
 */
import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Injectable()
export class CanonicalIdsPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    return metadata.type === 'param' && typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : value
  }
}
