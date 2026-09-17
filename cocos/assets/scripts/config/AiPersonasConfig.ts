/** Shape matches assets/config/ai_personas.json — engine only needs load readiness. */
export interface AiPersonasConfig {
  schema_version: string;
  personas: Record<string, unknown>;
}
