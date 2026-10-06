import { Nav } from "@/components/Nav";
import { OFFERED_SKUS, SKU_LABELS, SKU_PRICES_CENTS } from "@6frame/contracts";

export default function PricingPage() {
  const skus = OFFERED_SKUS;
  return (
    <div className="wrap">
      <Nav />
      <h1>Pricing</h1>
      <p className="lede">
        Fixed SKUs. Quotes are deterministic. Refunds for platform-caused pre-start failures
        only. Browser success URLs are never payment proof.
      </p>
      <div className="grid">
        {skus.map((sku) => (
          <div className="card" key={sku}>
            <h3>{SKU_LABELS[sku]}</h3>
            <div className="price">${(SKU_PRICES_CENTS[sku] / 100).toFixed(2)}</div>
            <p className="mono">{sku}</p>
          </div>
        ))}
      </div>
      <div className="footer">Prepaid credit pack: $100 → $110 usable balance.</div>
    </div>
  );
}
