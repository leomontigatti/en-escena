import { afterEach, vi } from "vitest";

import {
  createReactDomTestRenderer,
  getButton as getReactDomButton,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const portalSubmissionRouterMocks = vi.hoisted(() => ({
  useFetcher: vi.fn(),
  useNavigation: vi.fn(),
  useSubmit: vi.fn(),
  useViewTransitionState: vi.fn((_: string) => false),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useActionData: () => undefined,
    useFetcher: portalSubmissionRouterMocks.useFetcher,
    useNavigation: portalSubmissionRouterMocks.useNavigation,
    useSubmit: portalSubmissionRouterMocks.useSubmit,
    useViewTransitionState: portalSubmissionRouterMocks.useViewTransitionState,
  };
});

type PortalSubmissionFetcherState = {
  data: undefined;
  state: "idle" | "submitting";
  submit: ReturnType<typeof vi.fn>;
};

const portalSubmissionRenderer = createReactDomTestRenderer();

function installPortalSubmissionTestHooks() {
  afterEach(() => {
    resetPortalSubmissionTestDom();
    resetPortalSubmissionRouterMocks();
  });
}

const renderPortalSubmission = portalSubmissionRenderer.renderAsync;
const rerenderPortalSubmission = portalSubmissionRenderer.renderAsync;
const updatePortalSubmissionForm = updateReactDomForm;

async function clickButton(label: string) {
  await updateReactDomForm(() => {
    getReactDomButton(label).click();
  });
}

function resetPortalSubmissionTestDom() {
  portalSubmissionRenderer.cleanup();
}

function resetPortalSubmissionRouterMocks() {
  portalSubmissionRouterMocks.useFetcher.mockReset();
  portalSubmissionRouterMocks.useNavigation.mockReset();
  portalSubmissionRouterMocks.useSubmit.mockReset();
  portalSubmissionRouterMocks.useViewTransitionState.mockReset();
  portalSubmissionRouterMocks.useViewTransitionState.mockReturnValue(false);
}

export {
  clickButton,
  installPortalSubmissionTestHooks,
  portalSubmissionRouterMocks,
  renderPortalSubmission,
  rerenderPortalSubmission,
  updatePortalSubmissionForm,
  type PortalSubmissionFetcherState,
};
