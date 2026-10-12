import { DefaultNamingStrategy } from 'typeorm';

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** camelCase properties -> snake_case columns, so SQL stays idiomatic. */
export class SnakeNamingStrategy extends DefaultNamingStrategy {
  columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    return customName ?? snake([...embeddedPrefixes, propertyName].join('_'));
  }
}
