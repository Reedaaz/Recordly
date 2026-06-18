import { describe, expect, it } from "vitest";
import type { WebcamHideRegion } from "./types";
import { getWebcamHideTransform } from "./webcamOverlay";
import {
	getActiveWebcamHideRegion,
	getNextWebcamHideRegionId,
	getWebcamHideStateAtTime,
	isWebcamHiddenAtTime,
	normalizeWebcamHideRegions,
} from "./webcamHideRegions";

function makeRegion(
	overrides: Partial<WebcamHideRegion> & { id: string; startMs: number; endMs: number },
): WebcamHideRegion {
	return {
		exitEdge: "bottom",
		exitStyle: "slide-fade",
		enterEdge: "bottom",
		enterStyle: "slide-fade",
		...overrides,
	};
}

describe("webcamHideRegions", () => {
	it("reports visible (amount 0) when there are no active regions", () => {
		expect(getWebcamHideStateAtTime([], 1_000).amount).toBe(0);
		expect(getWebcamHideStateAtTime(undefined, 1_000).amount).toBe(0);
	});

	it("reports fully hidden inside an active region", () => {
		const regions = [makeRegion({ id: "r1", startMs: 1_000, endMs: 2_000 })];
		expect(getWebcamHideStateAtTime(regions, 1_500).amount).toBe(1);
		expect(isWebcamHiddenAtTime(regions, 1_500)).toBe(true);
	});

	it("treats start as inclusive and end as exclusive", () => {
		const regions = [
			makeRegion({
				id: "r1",
				startMs: 1_000,
				endMs: 2_000,
				exitStyle: "instant",
				enterStyle: "instant",
			}),
		];
		expect(getActiveWebcamHideRegion(regions, 1_000)?.id).toBe("r1");
		expect(getActiveWebcamHideRegion(regions, 2_000)).toBeNull();
		expect(getWebcamHideStateAtTime(regions, 1_000).amount).toBe(1);
		expect(getWebcamHideStateAtTime(regions, 2_000).amount).toBe(0);
	});

	it("chooses the overlapping region with the highest startMs for active lookup", () => {
		const regions = [
			makeRegion({ id: "early", startMs: 1_000, endMs: 5_000 }),
			makeRegion({ id: "late", startMs: 2_000, endMs: 3_000 }),
		];
		expect(getActiveWebcamHideRegion(regions, 2_500)?.id).toBe("late");
	});

	it("normalizes valid persisted regions and drops invalid ones", () => {
		const normalized = normalizeWebcamHideRegions(
			[
				makeRegion({ id: "bad-duration", startMs: 1_000, endMs: 1_100 }),
				{
					id: "valid",
					startMs: 1_000.2,
					endMs: 2_000.7,
					exitEdge: "left",
					exitStyle: "slide",
					enterEdge: "right",
					enterStyle: "fade",
					transitionInMs: 250.2,
					transitionOutMs: 300.7,
				},
				{ id: "bad-time", startMs: Number.NaN, endMs: 3_000 } as unknown as WebcamHideRegion,
			],
			10_000,
		);

		expect(normalized).toEqual([
			{
				id: "valid",
				startMs: 1_000,
				endMs: 2_001,
				exitEdge: "left",
				exitStyle: "slide",
				enterEdge: "right",
				enterStyle: "fade",
				transitionInMs: 250,
				transitionOutMs: 301,
			},
		]);
	});

	it("falls back to default edge/style for invalid enum values", () => {
		const normalized = normalizeWebcamHideRegions([
			{
				id: "r1",
				startMs: 0,
				endMs: 1_000,
				exitEdge: "diagonal",
				exitStyle: "explode",
			} as unknown as WebcamHideRegion,
		]);

		expect(normalized[0].exitEdge).toBe("bottom");
		expect(normalized[0].exitStyle).toBe("slide-fade");
		expect(normalized[0].enterEdge).toBe("bottom");
		expect(normalized[0].enterStyle).toBe("slide-fade");
	});

	it("drops regions whose duration falls below the minimum after clamping to total duration", () => {
		const normalized = normalizeWebcamHideRegions(
			[makeRegion({ id: "r1", startMs: 900, endMs: 2_000 })],
			1_000,
		);

		expect(normalized).toEqual([]);
	});

	it("returns an empty array for non-array input", () => {
		expect(normalizeWebcamHideRegions(undefined)).toEqual([]);
		expect(normalizeWebcamHideRegions(null)).toEqual([]);
		expect(normalizeWebcamHideRegions("oops")).toEqual([]);
	});

	it("sorts non-overlapping regions by start", () => {
		const normalized = normalizeWebcamHideRegions([
			makeRegion({ id: "b", startMs: 4_000, endMs: 5_000 }),
			makeRegion({ id: "a", startMs: 1_000, endMs: 2_000 }),
			makeRegion({ id: "c", startMs: 2_500, endMs: 3_000 }),
		]);

		expect(normalized.map((region) => region.id)).toEqual(["a", "c", "b"]);
	});

	it("clips an earlier region so it ends where the next one starts", () => {
		const normalized = normalizeWebcamHideRegions([
			makeRegion({ id: "a", startMs: 1_000, endMs: 5_000 }),
			makeRegion({ id: "b", startMs: 3_000, endMs: 6_000 }),
		]);

		expect(normalized.map((region) => ({ id: region.id, startMs: region.startMs, endMs: region.endMs }))).toEqual([
			{ id: "a", startMs: 1_000, endMs: 3_000 },
			{ id: "b", startMs: 3_000, endMs: 6_000 },
		]);
	});

	it("drops a region fully shadowed by an overlapping one at the same start", () => {
		const normalized = normalizeWebcamHideRegions([
			makeRegion({ id: "short", startMs: 1_000, endMs: 1_500 }),
			makeRegion({ id: "long", startMs: 1_000, endMs: 4_000 }),
		]);

		expect(normalized.map((region) => region.id)).toEqual(["long"]);
	});

	it("clips the survivor to the next region after dropping a short middle overlap", () => {
		const normalized = normalizeWebcamHideRegions([
			makeRegion({ id: "a", startMs: 0, endMs: 2_000 }),
			makeRegion({ id: "b", startMs: 1_900, endMs: 2_050 }),
			makeRegion({ id: "c", startMs: 2_000, endMs: 4_000 }),
		]);

		expect(normalized.map((region) => ({ id: region.id, startMs: region.startMs, endMs: region.endMs }))).toEqual([
			{ id: "a", startMs: 0, endMs: 2_000 },
			{ id: "c", startMs: 2_000, endMs: 4_000 },
		]);
	});

	it("does not let a fallback id collide with an existing persisted id", () => {
		const normalized = normalizeWebcamHideRegions([
			makeRegion({ id: "webcam-hide-2", startMs: 0, endMs: 1_000 }),
			{ startMs: 2_000, endMs: 3_000 } as unknown as WebcamHideRegion,
		]);

		const ids = normalized.map((region) => region.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("generates unique ids that do not collide with existing ones", () => {
		const existing = [
			makeRegion({ id: "webcam-hide-1", startMs: 0, endMs: 1_000 }),
			makeRegion({ id: "webcam-hide-3", startMs: 2_000, endMs: 3_000 }),
		];

		expect(getNextWebcamHideRegionId(existing)).toBe("webcam-hide-2");
		expect(getNextWebcamHideRegionId([])).toBe("webcam-hide-1");
	});

	describe("getWebcamHideStateAtTime transitions", () => {
		it("ramps the hide amount up during the exit window before the region", () => {
			const regions = [makeRegion({ id: "r1", startMs: 1_000, endMs: 3_000, transitionInMs: 400 })];
			const value = getWebcamHideStateAtTime(regions, 800);
			expect(value.amount).toBeGreaterThan(0);
			expect(value.amount).toBeLessThan(1);
			expect(value.edge).toBe("bottom");
		});

		it("applies easing monotonically through the exit ramp", () => {
			const regions = [makeRegion({ id: "r1", startMs: 1_000, endMs: 3_000, transitionInMs: 400 })];
			const samples = [600, 700, 800, 900, 1_000].map((t) => getWebcamHideStateAtTime(regions, t).amount);
			for (let index = 1; index < samples.length; index += 1) {
				expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1]);
			}
			expect(samples[0]).toBeCloseTo(0, 1);
			expect(samples[samples.length - 1]).toBeCloseTo(1, 1);
		});

		it("ramps the hide amount down during the enter window and uses the enter edge", () => {
			const regions = [
				makeRegion({ id: "r1", startMs: 1_000, endMs: 3_000, enterEdge: "right", transitionOutMs: 400 }),
			];
			const value = getWebcamHideStateAtTime(regions, 3_200);
			expect(value.amount).toBeGreaterThan(0);
			expect(value.amount).toBeLessThan(1);
			expect(value.edge).toBe("right");
		});

		it("snaps instantly with the instant style (no ramp)", () => {
			const regions = [
				makeRegion({
					id: "r1",
					startMs: 1_000,
					endMs: 3_000,
					exitStyle: "instant",
					enterStyle: "instant",
					transitionInMs: 400,
					transitionOutMs: 400,
				}),
			];
			expect(getWebcamHideStateAtTime(regions, 800).amount).toBe(0);
			expect(getWebcamHideStateAtTime(regions, 1_000).amount).toBe(1);
			expect(getWebcamHideStateAtTime(regions, 3_200).amount).toBe(0);
		});
	});

	describe("getWebcamHideTransform", () => {
		const box = { x: 100, y: 100, width: 200, height: 150, containerWidth: 800, containerHeight: 600 };

		it("returns no offset and full opacity when visible", () => {
			expect(getWebcamHideTransform({ amount: 0, edge: "bottom", style: "slide-fade", ...box })).toEqual({
				offsetX: 0,
				offsetY: 0,
				opacity: 1,
			});
		});

		it("slides fully past the bottom edge at amount 1 keeping opacity for slide-only", () => {
			const transform = getWebcamHideTransform({ amount: 1, edge: "bottom", style: "slide", ...box });
			expect(transform.offsetY).toBe(box.containerHeight - box.y);
			expect(transform.offsetX).toBe(0);
			expect(transform.opacity).toBe(1);
		});

		it("fades without moving for the fade style", () => {
			const transform = getWebcamHideTransform({ amount: 1, edge: "left", style: "fade", ...box });
			expect(transform.offsetX).toBe(0);
			expect(transform.offsetY).toBe(0);
			expect(transform.opacity).toBe(0);
		});

		it("slides left past the edge for the left edge", () => {
			const transform = getWebcamHideTransform({ amount: 1, edge: "left", style: "slide", ...box });
			expect(transform.offsetX).toBe(-(box.x + box.width));
		});
	});
});
