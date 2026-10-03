import { Form } from "react-router";
import { BackButton, Card, LargeTitle, Screen } from "~/components/ui";

export const handle = { hideTabBar: true };

export default function Settings() {
  return (
    <Screen>
      <BackButton to="/" label="Back to Today" />
      <LargeTitle title="Settings" />
      <Card className="p-4">
        <Form method="post" action="/logout">
          <button type="submit" className="h-11 w-full rounded-full text-[17px] font-semibold text-calories">
            Sign out
          </button>
        </Form>
      </Card>
    </Screen>
  );
}
