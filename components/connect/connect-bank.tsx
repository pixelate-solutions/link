"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { usePlaidConnect } from "./plaid-provider";

/**
 * Opens Plaid Link with a server-issued token. The public token goes straight
 * back to the server; access tokens never touch the browser. Link itself runs
 * in <PlaidProvider>; pass `onOpening` to close a surrounding sheet first.
 */
export function ConnectBank({
  connectionId,
  label = "Connect an account",
  onConnected,
  onOpening,
  investments,
  ...props
}: { connectionId?: string; label?: string; onConnected?: () => void; onOpening?: () => void; investments?: boolean } & Omit<ButtonProps, "onClick">) {
  const { connect } = usePlaidConnect();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    // Close any surrounding sheet before Link opens: a modal sheet would swallow clicks in Plaid's iframe.
    onOpening?.();
    setBusy(true);
    await connect({ connectionId, investments, onConnected });
    setBusy(false);
  };

  return (
    <Button onClick={start} busy={busy} {...props}>
      {label}
    </Button>
  );
}
