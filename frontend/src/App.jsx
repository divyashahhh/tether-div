import { useRef, useState } from "react";
import { api, DEMO_MODE } from "./api/client";
import { IconLogout, IconMoments, IconNow, IconPlans, IconUnlink, IconUser } from "./components/Icons";
import { BottomTabs, PhoneShell, TopBar, Wordmark } from "./components/PhoneShell";
import { Button } from "./components/ui/Button";
import { Menu } from "./components/ui/Menu";
import { Avatar, Spinner } from "./components/ui/Primitives";
import { Sheet } from "./components/ui/Sheet";
import { useToasts } from "./components/ui/ToastStack";
import { useAuth } from "./features/auth/AuthProvider";
import { usePair } from "./features/sync/PairProvider";
import { AuthScreen } from "./screens/AuthScreen";
import { MomentsTab } from "./screens/MomentsTab";
import { NowTab } from "./screens/NowTab";
import { PairScreen } from "./screens/PairScreen";
import { PlansTab } from "./screens/PlansTab";
import { ProfileForm, ProfileSetupScreen } from "./screens/ProfileForm";

const TABS = [
  { id: "now", label: "Now", icon: IconNow },
  { id: "moments", label: "Moments", icon: IconMoments },
  { id: "plans", label: "Plans", icon: IconPlans }
];

function Centered({ children }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center text-sm text-muted">{children}</div>;
}

function Screen() {
  const { user, loading, bootError, retry } = useAuth();
  const pair = usePair();

  if (loading) {
    return (
      <Centered>
        <Wordmark className="text-4xl" />
        <Spinner />
      </Centered>
    );
  }
  if (bootError) {
    return (
      <Centered>
        <Wordmark className="text-4xl" />
        <p>{bootError}</p>
        <Button onClick={retry}>Try again</Button>
      </Centered>
    );
  }
  if (!user) return <AuthScreen />;
  if (!user.profile_complete) return <ProfileSetupScreen />;
  if (pair.loading) {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }
  if (!pair.isPaired) return <PairScreen />;
  return <PairedHome />;
}

function PairedHome() {
  const { user, signOut } = useAuth();
  const { partner, partnerOnline, connection } = usePair();
  const { pushToast } = useToasts();
  const [tab, setTab] = useState("now");
  const [sheet, setSheet] = useState(null);
  const scrollRef = useRef(null);

  const changeTab = (id) => {
    setTab(id);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  async function unpair() {
    try {
      await api.unpair();
    } catch (err) {
      pushToast({ icon: "⚠️", text: err.message, tone: "error" });
    }
    setSheet(null);
  }

  const title = { now: "Now", moments: "Moments", plans: "Plans" }[tab];

  return (
    <>
      <TopBar
        left={
          <div>
            <Wordmark className="text-xl" />
            <h1 className="-mt-1 text-2xl font-semibold">{title}</h1>
          </div>
        }
        right={
          <>
            {connection !== "live" ? (
              <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">
                <Spinner className="size-3" /> Reconnecting
              </span>
            ) : null}
            <Menu
              trigger={<Avatar name={user.display_name} size="sm" />}
              items={[
                {
                  key: "who",
                  header: (
                    <>
                      <p className="text-sm font-semibold">{user.display_name}</p>
                      <p className="truncate text-xs text-faint">{user.email}</p>
                      <p className="mt-1 text-xs text-muted">
                        Tethered with {partner.display_name} · {partnerOnline ? "online" : "offline"}
                      </p>
                      {DEMO_MODE ? <p className="mt-1 text-[11px] text-brand-bright">Demo mode · simulated partner</p> : null}
                    </>
                  )
                },
                { key: "d1", divider: true },
                { key: "profile", icon: <IconUser size={17} />, label: "Name & timezone", onSelect: () => setSheet("profile") },
                { key: "unpair", icon: <IconUnlink size={17} />, label: "Unpair", danger: true, onSelect: () => setSheet("unpair") },
                { key: "signout", icon: <IconLogout size={17} />, label: "Sign out", onSelect: signOut }
              ]}
            />
          </>
        }
      />

      <main ref={scrollRef} key={tab} className="min-h-0 flex-1 animate-pop-in overflow-y-auto overscroll-contain no-scrollbar">
        {tab === "now" ? <NowTab onPlanCall={() => changeTab("plans")} /> : null}
        {tab === "moments" ? <MomentsTab /> : null}
        {tab === "plans" ? <PlansTab /> : null}
      </main>

      <BottomTabs tabs={TABS} active={tab} onChange={changeTab} />

      <Sheet open={sheet === "profile"} onClose={() => setSheet(null)} title="Name & timezone">
        <ProfileForm submitLabel="Save" onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === "unpair"} onClose={() => setSheet(null)} title={`Unpair from ${partner.display_name}?`}>
        <p className="text-sm text-muted">
          You’ll both go back to the pairing screen. Your shared moments and plans stay with this pair and won’t carry over to a new one.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="quiet" className="flex-1" onClick={() => setSheet(null)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={unpair}>
            Unpair
          </Button>
        </div>
      </Sheet>
    </>
  );
}

export default function App() {
  return (
    <PhoneShell>
      <Screen />
    </PhoneShell>
  );
}
