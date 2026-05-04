import { z } from "zod";

export const sliderSchema = z.object({
  pimId: z.number().int().positive().describe("Slider PIM ID"),
  language: z.string(),
});
