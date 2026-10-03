import { Icon } from "./ui";

export function MealPhoto({ photoKey, alt, className, hero = false }: { photoKey: string | null; alt: string; className: string; hero?: boolean }) {
  if (photoKey) return <img src={`/media/${photoKey}`} alt={alt} className={`${className} object-cover`} />;
  if (hero) {
    return (
      <div aria-hidden="true" className={`${className} flex flex-col items-center justify-center gap-2.5 bg-card text-label-4`}>
        <Icon name="meal" size={56} strokeWidth={1.2} />
        <div className="text-[14px] font-semibold">Meal photo</div>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className={`${className} flex items-center justify-center bg-fill text-label-4`}>
      <Icon name="plate" size={22} strokeWidth={1.6} />
    </div>
  );
}
