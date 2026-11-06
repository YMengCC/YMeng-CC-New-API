import { z } from 'zod'

export const profileFormSchema = z.object({
  display_name: z
    .string()
    .trim()
    .refine(
      (name) => [...name].length <= 20,
      'Display name must be 20 characters or fewer'
    ),
})

export type ProfileFormValues = z.infer<typeof profileFormSchema>
