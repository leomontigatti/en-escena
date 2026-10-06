/**
 * Marks every page of the pruebas environment, so nobody working on its copy
 * of production data takes it for the real system. It is fixed and lets
 * clicks through, so it sits on top of any layout without moving it.
 */
export function PruebasBanner() {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center border-t-4 border-warning"
    >
      <span className="rounded-b-md bg-warning px-3 py-0.5 text-xs font-semibold tracking-widest text-background">
        PRUEBAS
      </span>
    </div>
  );
}
