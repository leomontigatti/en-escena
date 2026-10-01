export function StepIntro({ hint, title }: { hint: string; title: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-base font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
