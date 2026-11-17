import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

type PaginationItem = number | 'gap';

@Component({
  selector: 'app-pagination',
  imports: [FormsModule],
  templateUrl: './app-pagination.component.html',
  styleUrl: './app-pagination.component.css',
})
export class AppPaginationComponent {
  @Input() currentPage = 1;
  @Input() totalPages = 0;
  @Input() disabled = false;
  @Output() pageChange = new EventEmitter<number>();

  jumpPage: number | null = null;

  get safeTotalPages(): number {
    return Math.max(0, Math.floor(this.totalPages || 0));
  }

  get safeCurrentPage(): number {
    const totalPages = this.safeTotalPages;
    if (totalPages === 0) {
      return 0;
    }

    return Math.min(Math.max(1, Math.floor(this.currentPage || 1)), totalPages);
  }

  get pageItems(): PaginationItem[] {
    const totalPages = this.safeTotalPages;
    const currentPage = this.safeCurrentPage;

    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set<number>([1, totalPages, currentPage]);
    if (currentPage <= 4) {
      [2, 3, 4, 5].forEach((page) => pages.add(page));
    } else if (currentPage >= totalPages - 3) {
      [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach(
        (page) => pages.add(page),
      );
    } else {
      [currentPage - 1, currentPage + 1].forEach((page) => pages.add(page));
    }

    const sortedPages = [...pages]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((left, right) => left - right);
    const items: PaginationItem[] = [];

    sortedPages.forEach((page, index) => {
      const previousPage = sortedPages[index - 1];
      if (previousPage !== undefined && page - previousPage > 1) {
        items.push('gap');
      }
      items.push(page);
    });

    return items;
  }

  goToPreviousPage(): void {
    this.goToPage(this.safeCurrentPage - 1);
  }

  goToNextPage(): void {
    this.goToPage(this.safeCurrentPage + 1);
  }

  goToPage(page: number): void {
    const totalPages = this.safeTotalPages;
    const nextPage = Math.floor(Number(page));

    if (
      this.disabled ||
      totalPages === 0 ||
      !Number.isInteger(nextPage) ||
      nextPage < 1 ||
      nextPage > totalPages ||
      nextPage === this.safeCurrentPage
    ) {
      return;
    }

    this.pageChange.emit(nextPage);
  }

  commitJumpPage(): void {
    const page = this.jumpPage;
    this.jumpPage = null;

    if (page === null) {
      return;
    }

    this.goToPage(page);
  }
}
