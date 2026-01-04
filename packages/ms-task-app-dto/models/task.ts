import * as z from 'zod'

export const TitleMinLen = 3
export const TitleMaxLen = 150
export const DescriptionMaxLen = 2000

export const TaskInputDtoSchema = z.object({
  title: z
    .string('Title is required')
    .min(TitleMinLen, `Must be at least ${TitleMinLen} characters`)
    .max(TitleMaxLen, `Must be no more than ${TitleMaxLen} characters`),
  description: z
    .string()
    .max(DescriptionMaxLen, `Must be no more than ${DescriptionMaxLen} characters`)
    .optional(),
  completed: z.boolean(),
})

export const TaskDtoSchema = z.object({
  _id: z.string(),
  ...TaskInputDtoSchema.shape,
})

export type TaskInputDto = z.infer<typeof TaskInputDtoSchema>
export type TaskDto = z.infer<typeof TaskDtoSchema>

export function isTaskDto(obj: unknown): obj is TaskDto {
  return (
    typeof (obj as any)._id === 'string' &&
    typeof (obj as any).title === 'string' &&
    typeof (obj as any).completed === 'boolean'
  )
}
