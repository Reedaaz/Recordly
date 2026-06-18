import type { WebcamHideEdge, WebcamHideRegion, WebcamHideStyle } from "./types";
import {
	DEFAULT_WEBCAM_HIDE_ENTER_EDGE,
	DEFAULT_WEBCAM_HIDE_ENTER_STYLE,
	DEFAULT_WEBCAM_HIDE_EXIT_EDGE,
	DEFAULT_WEBCAM_HIDE_EXIT_STYLE,
	DEFAULT_WEBCAM_HIDE_TRANSITION_IN_MS,
	DEFAULT_WEBCAM_HIDE_TRANSITION_OUT_MS,
} from "./types";
import { clamp01, cubicBezier } from "./videoPlayback/mathUtils";

export const WEBCAM_HIDE_REGION_MIN_DURATION_MS = 250;
export const WEBCAM_HIDE_REGION_MIN_TRANSITION_MS = 0;
export const WEBCAM_HIDE_REGION_MAX_TRANSITION_MS = 2000;

const HIDE_EDGES: readonly WebcamHideEdge[] = ["bottom", "top", "left", "right"];
const HIDE_STYLES: readonly WebcamHideStyle[] = ["slide", "fade", "slide-fade", "instant"];

export interface WebcamHideTransitionDefaults {
	transitionInMs: number;
	transitionOutMs: number;
}

export interface WebcamHideState {
	/** 0 = camera fully visible, 1 = camera fully hidden. */
	amount: number;
	edge: WebcamHideEdge;
	style: WebcamHideStyle;
}

const DEFAULT_TRANSITIONS: WebcamHideTransitionDefaults = {
	transitionInMs: DEFAULT_WEBCAM_HIDE_TRANSITION_IN_MS,
	transitionOutMs: DEFAULT_WEBCAM_HIDE_TRANSITION_OUT_MS,
};

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function toIntegerMs(value: unknown): number | null {
	if (!isFiniteNumber(value)) return null;
	return Math.round(value);
}

function easeWebcamHideTransition(t: number): number {
	return cubicBezier(0.4, 0.0, 0.2, 1.0, clamp01(t));
}

function normalizeHideEdge(value: unknown, fallback: WebcamHideEdge): WebcamHideEdge {
	return typeof value === "string" && (HIDE_EDGES as readonly string[]).includes(value)
		? (value as WebcamHideEdge)
		: fallback;
}

function normalizeHideStyle(value: unknown, fallback: WebcamHideStyle): WebcamHideStyle {
	return typeof value === "string" && (HIDE_STYLES as readonly string[]).includes(value)
		? (value as WebcamHideStyle)
		: fallback;
}

function resolveDefaults(
	defaults: WebcamHideTransitionDefaults | undefined,
): WebcamHideTransitionDefaults {
	return {
		transitionInMs: clamp(
			Math.round(defaults?.transitionInMs ?? DEFAULT_TRANSITIONS.transitionInMs),
			WEBCAM_HIDE_REGION_MIN_TRANSITION_MS,
			WEBCAM_HIDE_REGION_MAX_TRANSITION_MS,
		),
		transitionOutMs: clamp(
			Math.round(defaults?.transitionOutMs ?? DEFAULT_TRANSITIONS.transitionOutMs),
			WEBCAM_HIDE_REGION_MIN_TRANSITION_MS,
			WEBCAM_HIDE_REGION_MAX_TRANSITION_MS,
		),
	};
}

function getTransitionInMs(
	region: WebcamHideRegion,
	defaults: WebcamHideTransitionDefaults,
): number {
	return clamp(
		Math.round(region.transitionInMs ?? defaults.transitionInMs),
		WEBCAM_HIDE_REGION_MIN_TRANSITION_MS,
		WEBCAM_HIDE_REGION_MAX_TRANSITION_MS,
	);
}

function getTransitionOutMs(
	region: WebcamHideRegion,
	defaults: WebcamHideTransitionDefaults,
): number {
	return clamp(
		Math.round(region.transitionOutMs ?? defaults.transitionOutMs),
		WEBCAM_HIDE_REGION_MIN_TRANSITION_MS,
		WEBCAM_HIDE_REGION_MAX_TRANSITION_MS,
	);
}

export function clampWebcamHideRegionTransitionMs(durationMs: unknown): number | undefined {
	if (!isFiniteNumber(durationMs)) {
		return undefined;
	}

	return clamp(
		Math.round(durationMs),
		WEBCAM_HIDE_REGION_MIN_TRANSITION_MS,
		WEBCAM_HIDE_REGION_MAX_TRANSITION_MS,
	);
}

export function normalizeWebcamHideRegions(
	input: unknown,
	totalDurationMs?: number,
): WebcamHideRegion[] {
	if (!Array.isArray(input)) {
		return [];
	}

	const hasDurationLimit = isFiniteNumber(totalDurationMs) && totalDurationMs > 0;
	const maxEndMs = hasDurationLimit ? Math.round(totalDurationMs) : null;

	const normalized: WebcamHideRegion[] = [];
	const usedIds = new Set<string>();

	for (let index = 0; index < input.length; index += 1) {
		const raw = input[index];

		if (!raw || typeof raw !== "object") {
			continue;
		}

		const candidate = raw as Partial<WebcamHideRegion>;

		const start = toIntegerMs(candidate.startMs);
		const end = toIntegerMs(candidate.endMs);

		if (start === null || end === null) {
			continue;
		}

		let startMs = Math.max(0, start);
		let endMs = Math.max(0, end);

		if (maxEndMs !== null) {
			startMs = clamp(startMs, 0, maxEndMs);
			endMs = clamp(endMs, 0, maxEndMs);
		}

		if (endMs - startMs < WEBCAM_HIDE_REGION_MIN_DURATION_MS) {
			continue;
		}

		let id =
			typeof candidate.id === "string" && candidate.id.trim().length > 0
				? candidate.id
				: `webcam-hide-${index + 1}`;
		if (usedIds.has(id)) {
			let suffix = index + 1;
			let candidateId = `webcam-hide-${suffix}`;
			while (usedIds.has(candidateId)) {
				suffix += 1;
				candidateId = `webcam-hide-${suffix}`;
			}
			id = candidateId;
		}
		usedIds.add(id);

		const transitionInMs = clampWebcamHideRegionTransitionMs(candidate.transitionInMs);
		const transitionOutMs = clampWebcamHideRegionTransitionMs(candidate.transitionOutMs);

		normalized.push({
			id,
			startMs,
			endMs,
			exitEdge: normalizeHideEdge(candidate.exitEdge, DEFAULT_WEBCAM_HIDE_EXIT_EDGE),
			exitStyle: normalizeHideStyle(candidate.exitStyle, DEFAULT_WEBCAM_HIDE_EXIT_STYLE),
			enterEdge: normalizeHideEdge(candidate.enterEdge, DEFAULT_WEBCAM_HIDE_ENTER_EDGE),
			enterStyle: normalizeHideStyle(candidate.enterStyle, DEFAULT_WEBCAM_HIDE_ENTER_STYLE),
			...(transitionInMs !== undefined ? { transitionInMs } : {}),
			...(transitionOutMs !== undefined ? { transitionOutMs } : {}),
		});
	}

	const sorted = normalized.sort((left, right) => {
		if (left.startMs !== right.startMs) {
			return left.startMs - right.startMs;
		}

		return left.endMs - right.endMs;
	});

	// Resolve overlaps deterministically so preview and export always agree on a
	// single active hide region per instant (same two-phase algorithm as the
	// other webcam region resolvers).
	const kept: WebcamHideRegion[] = [];
	for (const region of sorted) {
		while (kept.length > 0) {
			const previous = kept[kept.length - 1];
			if (region.startMs >= previous.endMs) {
				break;
			}
			if (region.startMs - previous.startMs >= WEBCAM_HIDE_REGION_MIN_DURATION_MS) {
				break;
			}
			kept.pop();
		}
		kept.push(region);
	}

	return kept.map((region, index) => {
		const next = kept[index + 1];
		return next && region.endMs > next.startMs ? { ...region, endMs: next.startMs } : region;
	});
}

export function getActiveWebcamHideRegion(
	regions: readonly WebcamHideRegion[] | undefined,
	timeMs: number,
): WebcamHideRegion | null {
	if (!regions?.length || !Number.isFinite(timeMs)) {
		return null;
	}

	const roundedTimeMs = Math.round(timeMs);
	let active: WebcamHideRegion | null = null;

	for (const region of regions) {
		if (roundedTimeMs >= region.startMs && roundedTimeMs < region.endMs) {
			if (!active || region.startMs >= active.startMs) {
				active = region;
			}
		}
	}

	return active;
}

export function isWebcamHiddenAtTime(
	regions: readonly WebcamHideRegion[] | undefined,
	timeMs: number,
): boolean {
	return getActiveWebcamHideRegion(regions, timeMs) !== null;
}

function getRegionHideContribution(
	region: WebcamHideRegion,
	timeMs: number,
	defaults: WebcamHideTransitionDefaults,
): WebcamHideState | null {
	const exitDurationMs = getTransitionInMs(region, defaults);
	const enterDurationMs = getTransitionOutMs(region, defaults);

	// Camera leaving — eased ramp before the region: [startMs - exitDuration, startMs).
	if (
		region.exitStyle !== "instant" &&
		exitDurationMs > 0 &&
		timeMs >= region.startMs - exitDurationMs &&
		timeMs < region.startMs
	) {
		const progress = easeWebcamHideTransition(
			(timeMs - (region.startMs - exitDurationMs)) / exitDurationMs,
		);
		return { amount: progress, edge: region.exitEdge, style: region.exitStyle };
	}

	// Held fully hidden: [startMs, endMs).
	if (timeMs >= region.startMs && timeMs < region.endMs) {
		return { amount: 1, edge: region.exitEdge, style: region.exitStyle };
	}

	// Camera returning — eased ramp after the region: [endMs, endMs + enterDuration).
	if (
		region.enterStyle !== "instant" &&
		enterDurationMs > 0 &&
		timeMs >= region.endMs &&
		timeMs < region.endMs + enterDurationMs
	) {
		const progress = easeWebcamHideTransition((timeMs - region.endMs) / enterDurationMs);
		return { amount: 1 - progress, edge: region.enterEdge, style: region.enterStyle };
	}

	return null;
}

/**
 * Deterministic hide-state resolver shared by preview and export. Returns how
 * hidden the webcam is at a given time (0 visible -> 1 fully hidden) plus the
 * edge/style driving the slide so the renderer can push the overlay off-screen.
 */
export function getWebcamHideStateAtTime(
	regions: readonly WebcamHideRegion[] | undefined,
	timeMs: number,
	defaults?: WebcamHideTransitionDefaults,
): WebcamHideState {
	const fallback: WebcamHideState = {
		amount: 0,
		edge: DEFAULT_WEBCAM_HIDE_EXIT_EDGE,
		style: DEFAULT_WEBCAM_HIDE_EXIT_STYLE,
	};

	if (!regions?.length || !Number.isFinite(timeMs)) {
		return fallback;
	}

	const roundedTimeMs = Math.round(timeMs);
	const resolvedDefaults = resolveDefaults(defaults);

	let best: WebcamHideState = fallback;
	let bestStartMs = Number.NEGATIVE_INFINITY;

	for (const region of regions) {
		const contribution = getRegionHideContribution(region, roundedTimeMs, resolvedDefaults);
		if (!contribution) {
			continue;
		}

		if (
			contribution.amount > best.amount ||
			(contribution.amount === best.amount && region.startMs >= bestStartMs)
		) {
			best = contribution;
			bestStartMs = region.startMs;
		}
	}

	return best;
}

export function getNextWebcamHideRegionId(regions: readonly WebcamHideRegion[]): string {
	const usedNumbers = new Set<number>();

	for (const region of regions) {
		const match = /^webcam-hide-(\d+)$/.exec(region.id);
		if (match) {
			usedNumbers.add(Number(match[1]));
		}
	}

	let next = 1;
	while (usedNumbers.has(next)) {
		next += 1;
	}

	return `webcam-hide-${next}`;
}
