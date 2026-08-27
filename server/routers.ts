import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getPdfDocument, listDrivePdfDocuments, toPublicDriveError } from "./driveDocuments";

function toTrpcError(error: unknown): TRPCError {
  const driveError = toPublicDriveError(error);
  const code =
    driveError.kind === "configuration"
      ? "PRECONDITION_FAILED"
      : driveError.kind === "unauthorized"
        ? "FORBIDDEN"
        : driveError.kind === "unavailable"
          ? "NOT_FOUND"
          : driveError.kind === "invalid"
            ? "BAD_REQUEST"
            : "INTERNAL_SERVER_ERROR";

  return new TRPCError({ code, message: driveError.message });
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  documents: router({
    list: publicProcedure.query(async () => {
      try {
        const documents = await listDrivePdfDocuments();
        return { documents, refreshedAt: Date.now() };
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
    refresh: publicProcedure.mutation(async () => {
      try {
        const documents = await listDrivePdfDocuments();
        return { documents, refreshedAt: Date.now() };
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
    access: publicProcedure
      .input(z.object({ fileId: z.string().trim().min(1).max(200) }))
      .query(async ({ input }) => {
        try {
          const document = await getPdfDocument(input.fileId);
          const encodedId = encodeURIComponent(document.id);
          return {
            document,
            viewerUrl: `/api/documents/${encodedId}/content`,
            downloadUrl: document.canDownload ? `/api/documents/${encodedId}/content?download=1` : null,
          };
        } catch (error) {
          throw toTrpcError(error);
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
