import { getAvatarObjectPublicUrl } from "../services/storageService.js";

export const mapUserForResponse = <T extends { avatarPic?: string | null }>(
  user: T
): T => {
  if (!user) {
    return user;
  }

  return {
    ...user,
    avatarPic: getAvatarObjectPublicUrl(user.avatarPic),
  };
};
