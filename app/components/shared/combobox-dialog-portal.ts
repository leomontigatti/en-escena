import {
  useEffect,
  useState,
  type ComponentProps,
  type RefObject,
} from "react";

import type { ComboboxContent } from "@/components/ui/combobox";

// A combobox popup lives in a portal, so inside a dialog it is an outside
// press by default: clicking an option dismisses the dialog, and the dialog's
// layer above the popup blocks pointer events on the search input.
// `DialogContent` renders a `dialog-combobox-portal-host` for exactly this
// case; these are the `ComboboxContent` props that portal the popup into it,
// mark it as a branch of the dialog's dismissable layer, lift it above the
// dialog and keep it from sliding off the anchor.
type ComboboxDialogPortalProps = Pick<
  ComponentProps<typeof ComboboxContent>,
  | "collisionAvoidance"
  | "dismissableLayerBranch"
  | "portalContainer"
  | "positionerClassName"
>;

const dialogCollisionAvoidance = {
  side: "none",
  align: "shift",
  fallbackAxisSide: "none",
} as const;

const outsideDialog: ComboboxDialogPortalProps = {
  collisionAvoidance: undefined,
  dismissableLayerBranch: false,
  portalContainer: null,
  positionerClassName: undefined,
};

// Resolves, from the element the popup anchors to, whether the combobox sits
// inside a `DialogContent`, and returns the `ComboboxContent` props to spread
// so the popup works from there. Outside a dialog every prop is inert.
export function useComboboxDialogPortal(
  anchorRef: RefObject<HTMLElement | null>,
) {
  const [portalProps, setPortalProps] =
    useState<ComboboxDialogPortalProps>(outsideDialog);

  useEffect(() => {
    const dialogContent =
      anchorRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]') ??
      null;

    if (!dialogContent) {
      setPortalProps(outsideDialog);
      return;
    }

    setPortalProps({
      collisionAvoidance: dialogCollisionAvoidance,
      dismissableLayerBranch: true,
      portalContainer: dialogContent.querySelector<HTMLElement>(
        '[data-slot="dialog-combobox-portal-host"]',
      ),
      positionerClassName: "pointer-events-auto z-60",
    });
  }, [anchorRef]);

  return portalProps;
}
