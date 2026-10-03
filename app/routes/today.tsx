import { Link } from "react-router";
import { Icon, LargeTitle, Screen } from "~/components/ui";

export default function Today() {
  return (
    <Screen>
      <LargeTitle
        eyebrow="Rocky"
        title="Today"
        right={
          <Link to="/settings" aria-label="Settings" className="glass flex size-11 items-center justify-center rounded-full">
            <Icon name="gear" />
          </Link>
        }
      />
    </Screen>
  );
}
