import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArchive,
  LucideArrowLeftRight,
  LucideBatteryCharging,
  LucideBox,
  LucideCalendarClock,
  LucideCamera,
  LucideClockAlert,
  LucideDynamicIcon,
  LucideHardDrive,
  LucideHeadphones,
  LucideIconData,
  LucideKeyboard,
  LucideLaptop,
  LucideMonitor,
  LucideMouse,
  LucidePackage,
  LucidePcCase,
  LucidePrinter,
  LucideProjector,
  LucideRouter,
  LucideServer,
  LucideShield,
  LucideShieldAlert,
  LucideSmartphone,
  LucideTablet,
  LucideTriangleAlert,
  LucideWrench,
} from '@lucide/angular';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { UserProfile } from '../../../../core/auth/auth.models';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { AppCountUpComponent } from '../../../../shared/components/app-count-up/app-count-up.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import {
  AssetLoanListResponse,
  AssetLoanRecord,
} from '../../../assets/models/asset-loan.models';
import {
  AssetStatus,
  AssetTypeSummaryResponse,
} from '../../../assets/models/asset-view.models';
import { AssetLoansApiService } from '../../../assets/services/asset-loans-api.service';
import { AssetsApiService } from '../../../assets/services/assets-api.service';
import { DashboardOverviewResponse } from '../../models/dashboard.models';
import { clearLegacyDashboardCache } from '../../utils/dashboard-cache.util';

type DashboardScopeMode = 'overall' | 'location';
type Tone = 'danger' | 'warning' | 'neutral';
interface MiniSegment {
  key: string;
  label: string;
  count: number;
  color: string;
}

interface MiniDay {
  key: string;
  label: string;
  count: number;
  height: number;
  isToday: boolean;
  title: string;
}

/** The small chart inside each headline figure that explains the number. */
type MiniViz =
  | { kind: 'segments'; segments: MiniSegment[] }
  | { kind: 'week'; days: MiniDay[] };

interface TrendPoint {
  label: string;
  assigned: number;
  returned: number;
  x: number;
  yAssigned: number;
  yReturned: number;
}

interface ActionMetric {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  icon: LucideIconData;
  mini: MiniViz;
  emptyText: string;
  link?: string;
  queryParams?: Record<string, string>;
}

interface FollowUpLoan {
  loanId: number;
  loanNo: string;
  borrower: string;
  assetsOut: number;
  dueDate: string;
  /** Negative when overdue. */
  daysUntilDue: number;
}

interface StatusSegment {
  status: AssetStatus;
  label: string;
  count: number;
  percent: number;
  tone: 'loaned' | 'storage' | 'repair' | 'problem' | 'disposed';
  icon: LucideIconData;
}

interface BreakdownRow {
  id: number;
  name: string;
  icon: LucideIconData;
  total: number;
  available: number;
  onLoan: number;
  problems: number;
  onLoanPercent: number;
}

interface WarrantyRow {
  key: string;
  assetName: string;
  assetTypeName: string;
  date: string;
  daysRemaining: number;
  link: (string | number)[];
}

interface DashboardData {
  overview: DashboardOverviewResponse | null;
  types: AssetTypeSummaryResponse[] | null;
  overdue: AssetLoanListResponse | null;
  active: AssetLoanListResponse | null;
}

const WARRANTY_WINDOW_DAYS = 90;
const DUE_SOON_DAYS = 7;
const FOLLOW_UP_LIMIT = 8;
const TYPE_ROW_LIMIT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCOPE_STORAGE_KEY = 'dashboard-superadmin-scope';

const STATUS_ORDER: {
  status: AssetStatus;
  label: string;
  tone: StatusSegment['tone'];
  icon: LucideIconData;
}[] = [
  { status: 'In Storage', label: 'Available', tone: 'storage', icon: LucidePackage.icon },
  { status: 'Loaned', label: 'On loan', tone: 'loaned', icon: LucideArrowLeftRight.icon },
  { status: 'In Repair', label: 'In repair', tone: 'repair', icon: LucideWrench.icon },
  { status: 'Damaged', label: 'Damaged', tone: 'problem', icon: LucideTriangleAlert.icon },
  { status: 'Lost', label: 'Lost', tone: 'problem', icon: LucideTriangleAlert.icon },
  { status: 'Disposed', label: 'Disposed', tone: 'disposed', icon: LucideArchive.icon },
];

/** Asset type name -> icon. Shape identifies the type; colour stays neutral. */
const TYPE_ICON_RULES: [RegExp, LucideIconData][] = [
  [/laptop|notebook|chromebook|macbook/, LucideLaptop.icon],
  [/server|\bnas\b/, LucideServer.icon],
  [/router|switch|access point|wi-?fi|network/, LucideRouter.icon],
  [/firewall|antivirus|security/, LucideShield.icon],
  [/printer|scanner|copier/, LucidePrinter.icon],
  [/projector/, LucideProjector.icon],
  [/\bups\b|battery|power/, LucideBatteryCharging.icon],
  [/monitor|display|screen|\btv\b/, LucideMonitor.icon],
  [/desktop|computer|workstation|\bpc\b|tower|all-in-one/, LucidePcCase.icon],
  [/tablet|ipad/, LucideTablet.icon],
  [/phone|mobile/, LucideSmartphone.icon],
  [/camera|cctv|webcam/, LucideCamera.icon],
  [/keyboard/, LucideKeyboard.icon],
  [/mouse/, LucideMouse.icon],
  [/headphone|headset|speaker|audio/, LucideHeadphones.icon],
  [/drive|disk|ssd|hdd|storage/, LucideHardDrive.icon],
];



@Component({
  selector: 'app-dashboard',
  imports: [
    AppCountUpComponent,
    DatePipe,
    DecimalPipe,
    LucideDynamicIcon,
    NgTemplateOutlet,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly assetsApi = inject(AssetsApiService);
  private readonly loansApi = inject(AssetLoansApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);

  // ---- identity / shell -------------------------------------------------
  readonly user = this.authService.user;
  readonly displayName = computed(() => {
    const user = this.user();
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return user?.fullName || user?.name || fullName || user?.username || '';
  });
  readonly role = computed(() => this.user()?.role || '');
  readonly avatarUrl = computed(() => this.user()?.avatarPic || '');
  readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
  readonly isSuperAdmin = computed(() => {
    const role = this.role().toLowerCase();
    return role === 'super_admin' || role === 'superadmin';
  });

  // ---- scope ------------------------------------------------------------
  readonly activeLocationName = computed(
    () => this.locationContext.selectedLocation()?.name ?? 'Current location',
  );
  readonly scope = signal<DashboardScopeMode>(this.readInitialScope());
  readonly isOverall = computed(() => this.isSuperAdmin() && this.scope() === 'overall');
  readonly hasLocation = computed(() => this.locationContext.currentLocationId() !== null);

  // ---- data state -------------------------------------------------------
  readonly isLoading = signal(true);
  readonly isRefreshing = signal(false);
  readonly loadFailed = signal(false);
  readonly lastUpdated = signal<Date | null>(null);
  private readonly data = signal<DashboardData>({
    overview: null,
    types: null,
    overdue: null,
    active: null,
  });
  readonly followUps = signal<FollowUpLoan[]>([]);
  readonly loansUnavailable = computed(
    () => !this.isLoading() && this.data().overdue === null,
  );

  // ---- derived: action metrics -----------------------------------------
  readonly overdueCount = computed(() => {
    const overdue = this.data().overdue;
    return overdue?.statusCounts?.Overdue ?? overdue?.totalItems ?? 0;
  });

  readonly activeLoans = computed(() =>
    (this.data().active?.assetLoans ?? []).filter((loan) => !this.isLoanOverdue(loan)),
  );

  readonly dueSoonCount = computed(
    () =>
      this.activeLoans().filter((loan) => {
        const days = this.daysUntil(loan.endLoanDate);
        return days >= 0 && days <= DUE_SOON_DAYS;
      }).length,
  );

  readonly statusTotals = computed<Record<AssetStatus, number>>(() => {
    const totals: Record<AssetStatus, number> = {
      'In Storage': 0,
      Loaned: 0,
      'In Repair': 0,
      Damaged: 0,
      Lost: 0,
      Disposed: 0,
    };

    const types = this.data().types;
    if (types && !this.isOverall()) {
      for (const type of types) {
        for (const { status } of STATUS_ORDER) {
          totals[status] += type.statusCounts[status] ?? 0;
        }
      }
      return totals;
    }

    // All-locations view: the overview summary is the only cross-location source.
    const summary = this.data().overview?.summary;
    if (summary) {
      totals.Loaned = summary.inLoaned ?? 0;
      totals['In Repair'] = summary.inRepair ?? 0;
      totals['In Storage'] = Math.max(
        summary.unassignedAssets ??
          (summary.totalAssets ?? 0) - (summary.inLoaned ?? 0) - (summary.inRepair ?? 0),
        0,
      );
    }
    return totals;
  });

  readonly totalAssets = computed(() =>
    Object.values(this.statusTotals()).reduce((sum, value) => sum + value, 0),
  );

  readonly problemCount = computed(() => {
    const totals = this.statusTotals();
    return totals['In Repair'] + totals.Damaged + totals.Lost;
  });

  readonly warrantyCount = computed(
    () => this.data().overview?.expiringSoon?.totalItems ?? this.warranties().length,
  );

  readonly metrics = computed<ActionMetric[]>(() => {
    const overdue = this.overdueCount();
    const totals = this.statusTotals();

    // Overdue loans by how late they are (darker = later).
    const lateDays = (this.data().overdue?.assetLoans ?? []).map(
      (loan) => -this.daysUntil(loan.endLoanDate),
    );
    const overdueMini: MiniViz = {
      kind: 'segments',
      segments: [
        { key: 'a', label: '1–7 d', count: lateDays.filter((d) => d <= 7).length, color: '#f0a04b' },
        { key: 'b', label: '8–30 d', count: lateDays.filter((d) => d > 7 && d <= 30).length, color: '#e0533f' },
        { key: 'c', label: '30 d+', count: lateDays.filter((d) => d > 30).length, color: '#a3241c' },
      ],
    };

    // Loans due back on each of the next seven days.
    const weekCounts = Array.from({ length: 7 }, () => 0);
    for (const loan of this.activeLoans()) {
      const days = this.daysUntil(loan.endLoanDate);
      if (days >= 0 && days < 7) {
        weekCounts[days] += 1;
      }
    }
    const weekMax = Math.max(1, ...weekCounts);
    const today = new Date();
    const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' });
    const weekMini: MiniViz = {
      kind: 'week',
      days: weekCounts.map((count, offset) => {
        const date = new Date(today.getTime() + offset * DAY_MS);
        return {
          key: `w${offset}`,
          label: offset === 0 ? 'Today' : weekday.format(date),
          count,
          height: (count / weekMax) * 100,
          isToday: offset === 0,
          title: `${count} due ${offset === 0 ? 'today' : new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date)}`,
        };
      }),
    };

    const problemMini: MiniViz = {
      kind: 'segments',
      segments: [
        { key: 'repair', label: 'Repair', count: totals['In Repair'], color: '#e0a020' },
        { key: 'damaged', label: 'Damaged', count: totals.Damaged, color: '#d9483b' },
        { key: 'lost', label: 'Lost', count: totals.Lost, color: '#8e2a6b' },
      ],
    };

    const warrantyDays = this.data().overview?.expiringSoon?.items?.map((item) => item.daysRemaining) ?? [];
    const warrantyMini: MiniViz = {
      kind: 'segments',
      segments: [
        { key: 'w30', label: '≤30 d', count: warrantyDays.filter((d) => d <= 30).length, color: '#3f3fb0' },
        { key: 'w60', label: '31–60 d', count: warrantyDays.filter((d) => d > 30 && d <= 60).length, color: '#7c62e4' },
        { key: 'w90', label: '61–90 d', count: warrantyDays.filter((d) => d > 60 && d <= 90).length, color: '#c08ae6' },
      ],
    };

    return [
      {
        key: 'overdue',
        label: 'Overdue loans',
        value: overdue,
        tone: overdue > 0 ? 'danger' : 'neutral',
        icon: LucideClockAlert.icon,
        mini: overdueMini,
        emptyText: 'Every loan is on time',
        link: '/assets/loans',
        queryParams: { status: 'Overdue' },
      },
      {
        key: 'due-soon',
        label: 'Due back this week',
        value: this.dueSoonCount(),
        tone: 'neutral',
        icon: LucideCalendarClock.icon,
        mini: weekMini,
        emptyText: 'Nothing due this week',
        link: '/assets/loans',
        queryParams: { status: 'Active' },
      },
      {
        key: 'problems',
        label: 'Out of service',
        value: this.problemCount(),
        tone: this.problemCount() > 0 ? 'warning' : 'neutral',
        icon: LucideWrench.icon,
        mini: problemMini,
        emptyText: 'Every asset is in service',
        link: '/assets',
      },
      {
        key: 'warranty',
        label: 'Warranties ending',
        value: this.warrantyCount(),
        tone: this.warrantyCount() > 0 ? 'warning' : 'neutral',
        icon: LucideShieldAlert.icon,
        mini: warrantyMini,
        emptyText: 'None in the next 90 days',
      },
    ];
  });

  // ---- derived: panels --------------------------------------------------
  readonly statusSegments = computed<StatusSegment[]>(() => {
    const totals = this.statusTotals();
    const total = this.totalAssets();

    return STATUS_ORDER.map(({ status, label, tone, icon }) => ({
      status,
      label,
      tone,
      icon,
      count: totals[status],
      percent: total > 0 ? (totals[status] / total) * 100 : 0,
    })).filter((segment) => segment.count > 0 || segment.status === 'Loaned' || segment.status === 'In Storage');
  });

  readonly statusAriaLabel = computed(
    () =>
      'Inventory by status: ' +
      this.statusSegments()
        .map((segment) => `${segment.label} ${segment.count}`)
        .join(', '),
  );

  readonly breakdownRows = computed<BreakdownRow[]>(() => {
    if (this.isOverall()) {
      return (this.data().overview?.utilisationByLocation?.items ?? [])
        .map((item) => ({
          id: item.locationId ?? 0,
          name: item.locationName,
          icon: LucideBox.icon,
          total: item.totalAssets,
          available: Math.max(item.totalAssets - item.assignedAssets, 0),
          onLoan: item.assignedAssets,
          problems: 0,
          onLoanPercent: item.totalAssets > 0 ? (item.assignedAssets / item.totalAssets) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);
    }

    return (this.data().types ?? [])
      .map((type) => {
        const counts = type.statusCounts;
        const total = STATUS_ORDER.reduce((sum, { status }) => sum + (counts[status] ?? 0), 0);
        const inService = total - (counts.Disposed ?? 0);
        const onLoan = counts.Loaned ?? 0;

        return {
          id: type.assetType.assetTypeId,
          name: type.assetType.name,
          icon: this.typeIcon(type.assetType.name),
          total,
          available: counts['In Storage'] ?? 0,
          onLoan,
          problems: (counts['In Repair'] ?? 0) + (counts.Damaged ?? 0) + (counts.Lost ?? 0),
          onLoanPercent: inService > 0 ? (onLoan / inService) * 100 : 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  });

  readonly visibleBreakdownRows = computed(() =>
    this.breakdownRows().slice(0, TYPE_ROW_LIMIT),
  );

  readonly breakdownTotals = computed(() =>
    this.breakdownRows().reduce(
      (sum, row) => ({
        total: sum.total + row.total,
        available: sum.available + row.available,
        onLoan: sum.onLoan + row.onLoan,
        problems: sum.problems + row.problems,
      }),
      { total: 0, available: 0, onLoan: 0, problems: 0 },
    ),
  );

  readonly warranties = computed<WarrantyRow[]>(() =>
    (this.data().overview?.expiringSoon?.items ?? [])
      .filter((item) => item.daysRemaining <= WARRANTY_WINDOW_DAYS)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 6)
      .map((item) => ({
        key: `${item.assetId}`,
        assetName: item.assetName,
        assetTypeName: item.assetTypeName,
        date: item.warrantyExpiryDate,
        daysRemaining: item.daysRemaining,
        link: ['/assets/types', item.assetTypeId, 'assets', item.assetId],
      })),
  );

  // ---- charts -----------------------------------------------------------
  readonly hoverTrend = signal<number | null>(null);

  /** Loans lent out vs returned per month, on one shared axis. */
  readonly trend = computed(() => {
    const items = this.data().overview?.assignmentTrend?.items ?? [];
    const peak = Math.max(0, ...items.flatMap((item) => [item.assigned, item.returned]));
    const max = this.niceMax(peak);
    const count = items.length;
    const x = (index: number) => (count <= 1 ? 50 : (index / (count - 1)) * 100);
    const y = (value: number) => 100 - (value / max) * 100;

    const points: TrendPoint[] = items.map((item, index) => ({
      label: item.label,
      assigned: item.assigned,
      returned: item.returned,
      x: x(index),
      yAssigned: y(item.assigned),
      yReturned: y(item.returned),
    }));

    const path = (key: 'yAssigned' | 'yReturned') =>
      points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point[key]}`).join(' ');

    // Direct end labels, nudged apart when the two lines finish close together.
    const last = points[points.length - 1];
    let endAssigned = last?.yAssigned ?? 0;
    let endReturned = last?.yReturned ?? 0;
    const gap = 16;
    if (Math.abs(endAssigned - endReturned) < gap) {
      const assignedOnTop = endAssigned <= endReturned;
      let top = Math.min(endAssigned, endReturned);
      let bottom = top + gap;
      if (bottom > 98) {
        bottom = 98;
        top = bottom - gap;
      }
      if (top < 2) {
        top = 2;
        bottom = top + gap;
      }
      endAssigned = assignedOnTop ? top : bottom;
      endReturned = assignedOnTop ? bottom : top;
    }

    return {
      points,
      hasData: peak > 0,
      ticks: [max, max / 2, 0],
      assignedPath: path('yAssigned'),
      returnedPath: path('yReturned'),
      endAssigned,
      endReturned,
      totalAssigned: items.reduce((sum, item) => sum + item.assigned, 0),
      totalReturned: items.reduce((sum, item) => sum + item.returned, 0),
    };
  });

  readonly hoveredTrendPoint = computed(() => {
    const index = this.hoverTrend();
    return index === null ? null : (this.trend().points[index] ?? null);
  });

  constructor() {
    // Reload whenever the selected location changes (topbar switcher).
    effect(() => {
      this.locationContext.currentLocationId();
      untracked(() => this.load());
    });
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      clearLegacyDashboardCache(window.localStorage);
    }

    if (!this.isSuperAdmin() && !this.locationContext.hasSelectedLocation()) {
      void this.router.navigateByUrl('/location');
    }
  }

  // ---- actions ----------------------------------------------------------
  refresh(): void {
    this.load({ refresh: true });
  }

  setScope(scope: DashboardScopeMode): void {
    if (!this.isSuperAdmin() || this.scope() === scope) {
      return;
    }
    if (scope === 'location' && !this.hasLocation()) {
      return;
    }

    this.scope.set(scope);
    try {
      window.sessionStorage.setItem(SCOPE_STORAGE_KEY, scope);
    } catch {
      // Storage unavailable: the scope still applies for this visit.
    }
    this.load();
  }

  openBreakdownRow(row: BreakdownRow): void {
    if (this.isOverall()) {
      if (row.id && this.locationContext.selectLocation(row.id)) {
        this.setScope('location');
      }
      return;
    }
    void this.router.navigate(['/assets/types', row.id]);
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  // ---- template helpers -------------------------------------------------
  /** Lateness as a figure: "132 d" when late, "today" / "in 3 d" when not. */
  lateLabel(days: number): string {
    if (days < 0) {
      return `${Math.abs(days)} d`;
    }
    if (days === 0) {
      return 'Due today';
    }
    return `in ${days} d`;
  }

  miniTotal(mini: MiniViz): number {
    return mini.kind === 'segments'
      ? mini.segments.reduce((sum, seg) => sum + seg.count, 0)
      : mini.days.reduce((sum, day) => sum + day.count, 0);
  }

  dueTone(days: number): Tone {
    if (days < 0) {
      return 'danger';
    }
    return days <= 2 ? 'warning' : 'neutral';
  }

  warrantyTone(days: number): Tone {
    if (days < 0) {
      return 'danger';
    }
    return days <= 30 ? 'warning' : 'neutral';
  }

  warrantyLabel(days: number): string {
    if (days < 0) {
      return 'Ended';
    }
    return days === 0 ? 'Today' : `${days} d`;
  }

  // ---- loading ----------------------------------------------------------
  private load(options: { refresh?: boolean } = {}): void {
    if (!this.isOverall() && !this.hasLocation()) {
      this.isLoading.set(false);
      return;
    }

    const locationId = this.isOverall() ? null : this.locationContext.currentLocationId();
    const hasData = this.lastUpdated() !== null;
    this.isLoading.set(!hasData);
    this.isRefreshing.set(hasData || !!options.refresh);
    this.loadFailed.set(false);

    // Each source fails independently so one slow or broken endpoint does
    // not blank the whole page.
    const overview$ = this.assetsApi
      .getDashboardOverview({
        locationId,
        expiringDays: WARRANTY_WINDOW_DAYS,
        trendMonths: 6,
        recentLimit: 1,
        upcomingLimit: 1,
      })
      .pipe(catchError(() => of(null)));

    const types$: Observable<AssetTypeSummaryResponse[] | null> = this.isOverall()
      ? of(null)
      : this.assetsApi
          .listAssetTypeOverview({ locationId, force: !!options.refresh || hasData })
          .pipe(catchError(() => of(null)));

    const overdue$ = this.loansApi
      .listAssetLoans({ status: 'Overdue', limit: 50, page: 1, locationId })
      .pipe(catchError(() => of(null)));

    const active$ = this.loansApi
      .listAssetLoans({ status: 'Active', limit: 100, page: 1, locationId })
      .pipe(catchError(() => of(null)));

    forkJoin({ overview: overview$, types: types$, overdue: overdue$, active: active$ })
      .pipe(
        switchMap((data) =>
          this.resolveFollowUps(data).pipe(map((followUps) => ({ data, followUps }))),
        ),
      )
      .subscribe(({ data, followUps }) => {
        this.data.set(data);
        this.followUps.set(followUps);
        this.loadFailed.set(
          !data.overview && !data.types && !data.overdue && !data.active,
        );
        this.lastUpdated.set(new Date());
        this.isLoading.set(false);
        this.isRefreshing.set(false);
      });
  }

  private resolveFollowUps(data: DashboardData): Observable<FollowUpLoan[]> {
    const overdue = data.overdue?.assetLoans ?? [];
    const dueSoon = (data.active?.assetLoans ?? []).filter((loan) => {
      if (this.isLoanOverdue(loan)) {
        return true;
      }
      const days = this.daysUntil(loan.endLoanDate);
      return days >= 0 && days <= DUE_SOON_DAYS;
    });

    const seen = new Set<number>();
    const loans = [...overdue, ...dueSoon]
      .filter((loan) => (seen.has(loan.assetLoanId) ? false : (seen.add(loan.assetLoanId), true)))
      .sort((a, b) => this.daysUntil(a.endLoanDate) - this.daysUntil(b.endLoanDate))
      .slice(0, FOLLOW_UP_LIMIT);

    if (loans.length === 0) {
      return of([]);
    }

    const profileIds = [...new Set(loans.map((loan) => loan.borrowerProfileId))];
    return forkJoin(
      profileIds.map((id) =>
        this.authService.getProfileById(id).pipe(catchError(() => of(null))),
      ),
    ).pipe(
      map((profiles) => {
        const byId = new Map<number, UserProfile | null>(
          profileIds.map((id, index) => [id, profiles[index]]),
        );

        return loans.map((loan) => ({
          loanId: loan.assetLoanId,
          loanNo: `LN-${String(loan.assetLoanId).padStart(5, '0')}`,
          borrower: byId.get(loan.borrowerProfileId)?.fullName || `Profile #${loan.borrowerProfileId}`,
          assetsOut: (loan.items ?? []).filter((item) => item.itemStatus === 'Loaned').length,
          dueDate: loan.endLoanDate,
          daysUntilDue: this.daysUntil(loan.endLoanDate),
        }));
      }),
    );
  }

  /** Round an axis maximum up to 1, 2 or 5 x 10^n, with an even half-way tick. */
  private niceMax(value: number): number {
    if (value <= 4) {
      return 4;
    }
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    for (const step of [1, 2, 5, 10]) {
      const candidate = step * magnitude;
      if (candidate >= value && candidate % 2 === 0) {
        return candidate;
      }
    }
    return 10 * magnitude;
  }

  private typeIcon(name: string): LucideIconData {
    const normalized = name.toLowerCase();
    return TYPE_ICON_RULES.find(([pattern]) => pattern.test(normalized))?.[1] ?? LucideBox.icon;
  }

  private isLoanOverdue(loan: AssetLoanRecord): boolean {
    return (
      loan.isOverdue === true ||
      loan.effectiveStatus === 'Overdue' ||
      loan.status === 'Overdue' ||
      this.daysUntil(loan.endLoanDate) < 0
    );
  }

  private daysUntil(date: string): number {
    const due = new Date(date);
    if (Number.isNaN(due.getTime())) {
      return 0;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / DAY_MS);
  }

  private readInitialScope(): DashboardScopeMode {
    const role = this.authService.user()?.role?.toLowerCase() ?? '';
    const isSuperAdmin = role === 'super_admin' || role === 'superadmin';
    const hasLocation = this.locationContext.currentLocationId() !== null;

    if (!isSuperAdmin) {
      return 'location';
    }

    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(SCOPE_STORAGE_KEY);
    } catch {
      stored = null;
    }

    if (stored === 'overall' || !hasLocation) {
      return 'overall';
    }
    return 'location';
  }
}
