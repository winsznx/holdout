export function HashLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="num mt-1 text-[12px] break-all">{value}</dd>
    </div>
  );
}
