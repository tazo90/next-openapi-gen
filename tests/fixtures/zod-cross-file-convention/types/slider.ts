import { z } from "zod";

import { sliderSchema } from "../schemas/sliderSchema.js";

export type Slider = z.infer<typeof sliderSchema>;
