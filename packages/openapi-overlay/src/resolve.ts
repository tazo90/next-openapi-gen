import type {
  ActionObject,
  OverlayAction,
  OverlayObject,
  ReusableActionReferenceObject,
} from "./types.js";

const REUSABLE_ACTION_POINTER_PREFIX = "#/components/actions/";

export function isReusableActionReference(
  action: OverlayAction,
): action is ReusableActionReferenceObject {
  return "$ref" in action && typeof action.$ref === "string";
}

export function resolveOverlayActions(overlay: OverlayObject): OverlayObject {
  const nextOverlay = structuredClone(overlay);
  nextOverlay.actions = nextOverlay.actions.map((action) =>
    isReusableActionReference(action)
      ? resolveReusableActionReference(action, nextOverlay)
      : action,
  );
  return nextOverlay;
}

function resolveReusableActionReference(
  reference: ReusableActionReferenceObject,
  overlay: OverlayObject,
): ActionObject {
  const key = parseReusableActionPointer(reference.$ref);
  const reusable = overlay.components?.actions?.[key];
  if (!reusable) {
    throw new Error(`Overlay reusable action ref "${reference.$ref}" resolved no value.`);
  }

  const fields = reusable.fields ?? {};
  const fieldTarget = (fields as Record<string, unknown>).target;
  if (fieldTarget !== undefined) {
    throw new Error(`Overlay reusable action "${key}" must not define fields.target.`);
  }

  const resolved: ActionObject = {
    ...fields,
    target: reference.target,
  };

  if (reference.description !== undefined) {
    resolved.description = reference.description;
  }
  if (reference.update !== undefined) {
    resolved.update = reference.update;
  }
  if (reference.remove !== undefined) {
    resolved.remove = reference.remove;
  }
  if (reference.copy !== undefined) {
    resolved.copy = reference.copy;
  }

  return resolved;
}

function parseReusableActionPointer(ref: string): string {
  if (!ref.startsWith(REUSABLE_ACTION_POINTER_PREFIX)) {
    throw new Error(
      `Overlay reusable action ref "${ref}" is not a same-document "#/components/actions/..." pointer.`,
    );
  }

  const encodedKey = ref.slice(REUSABLE_ACTION_POINTER_PREFIX.length);
  if (!encodedKey || encodedKey.includes("/")) {
    throw new Error(
      `Overlay reusable action ref "${ref}" is not a same-document "#/components/actions/..." pointer.`,
    );
  }

  return decodeJsonPointerToken(encodedKey);
}

function decodeJsonPointerToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}
