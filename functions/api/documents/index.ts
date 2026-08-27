import { errorResponse, listDriveDocuments, type DriveEnvironment } from "../../lib/drive";

export const onRequestGet = async ({ env }: { env: DriveEnvironment }): Promise<Response> => {
  try {
    return Response.json({ documents: await listDriveDocuments(env) });
  } catch (error) {
    return errorResponse(error);
  }
};
