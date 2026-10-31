export const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

/** The invite link people pay and register from; `token` personalises a reminder link. */
export const inviteUrl = async (code: string, token?: string | null) => `${appUrl()}/i/${code}${token ? `?r=${token}` : ""}`;
