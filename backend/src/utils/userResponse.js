import { getAvatarObjectPublicUrl } from "../services/storageService.js";

export const mapUserForResponse = (user) => {
  if (!user) {
    return user;
  }

  return {
    ...user,
    avatarPic: getAvatarObjectPublicUrl(user.avatarPic),
  };
};
