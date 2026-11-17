export type MobileMoreIcon =
  | 'custom'
  | 'licenses'
  | 'loans'
  | 'location'
  | 'users'
  | 'profiles'
  | 'settings';

export type MobileMoreItem = {
  route: string;
  label: string;
  description: string;
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
  const manage: MobileMoreItem[] = [];

  if (access.canAccessLocation) {
    manage.push({
      route: '/location',
      label: 'Locations',
      description: 'Switch branches and manage locations',
      icon: 'location',
    });
  }

  if (access.isSuperAdmin) {
    manage.push({
      route: '/users',
      label: 'Users',
      description: 'Manage accounts, roles, and access',
      icon: 'users',
    });
  }

  if (access.canManageProfiles) {
    manage.push({
      route: '/users/profiles',
      label: 'Profile Management',
      description: 'Organise people and assignments',
      icon: 'profiles',
    });
  }

  manage.push(
    {
      route: '/assets/loans',
      label: 'Asset Loans',
      description: 'Track borrowed and returned assets',
      icon: 'loans',
    },
    {
      route: '/licenses',
      label: 'Software Licenses',
      description: 'Monitor seats, renewals, and costs',
      icon: 'licenses',
    },
    {
      route: '/custom',
      label: 'Custom Types',
      description: 'Configure asset types and fields',
      icon: 'custom',
    },
  );

  return [
    {
      title: 'Manage',
      items: manage,
    },
    {
      title: 'Account',
      items: [
        {
          route: '/profile',
          label: 'My Profile',
          description: 'View and update your account details',
          icon: 'settings',
        },
      ],
    },
  ];
}
