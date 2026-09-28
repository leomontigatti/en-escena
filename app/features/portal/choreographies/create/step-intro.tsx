export function StepIntro({ hint, title }: { hint: string; title: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
