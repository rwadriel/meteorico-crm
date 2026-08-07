declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      name: string;
      role: string;
      permissions: string[];
      sessionTokenHash: string;
    };
  }
}
