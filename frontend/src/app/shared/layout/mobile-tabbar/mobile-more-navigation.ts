/**
 * Pages reachable from the mobile "More" sheet (and the /more fallback page).
 * Home, Assets, Loans and Licenses are tabs in the bottom bar, so they are not
 * listed here. Labels only: the icon and name identify each page, so there is
 * no description line.
 */
export type MobileMoreIcon =
  | 'files'
  | 'custom'
  | 'location'
  | 'users'
  | 'profiles'
  | 'account';

export type MobileMoreItem = {
  route: string;
  label: string;
  icon: MobileMoreIcon;
};

export type MobileMoreSection = {
  title: string;
  items: MobileMoreItem[];
};

export type MobileMoreAccess = {
  isSuperAdmin: boolean;
  canAccessLocation: boolean;
  canManageProfiles: boolean;
};

export function buildMobileMoreSections(
  access: MobileMoreAccess,
): MobileMoreSection[] {
  const manage: MobileMoreItem[] = [
    { route: '/files', label: 'Files', icon: 'files' },
    { route: '/custom', label: 'Custom types', icon: 'custom' },
  ];

  if (access.canAccessLocation) {
    manage.push({ route: '/location', label: 'Locations', icon: 'location' });
  }

  if (access.isSuperAdmin) {
    manage.push({ route: '/users', label: 'Users', icon: 'users' });
  }

  if (access.canManageProfiles) {
    manage.push({
      route: '/users/profiles',
      label: 'Profile management',
      icon: 'profiles',
    });
  }

  return [
    { title: 'Manage', items: manage },
    {
      title: 'Account',
      items: [{ route: '/profile', label: 'My profile', icon: 'account' }],
    },
  ];
}

/** True when `url` is the item's route or one of its children. */
export function isMobileMoreRouteActive(url: string, route: string): boolean {
  if (route === '/users') {
    // '/users/profiles' belongs to Profile management, not Users.
    return url === '/users' || (url.startsWith('/users/') && !url.startsWith('/users/profiles'));
  }
  return url === route || url.startsWith(`${route}/`);
}
