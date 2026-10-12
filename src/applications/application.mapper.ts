import { maskTail } from '../common/utils/redact';
import { MerchantApplication } from './merchant-application.entity';

/** API representation: the encrypted tax ID is never returned, only a masked tail. */
export function toApplicationResponse(app: MerchantApplication) {
  const { ownerTaxId, ...rest } = app;
  return { ...rest, ownerTaxIdMasked: ownerTaxId ? maskTail(ownerTaxId) : null };
}
