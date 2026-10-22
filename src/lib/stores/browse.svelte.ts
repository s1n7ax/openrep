/**
 * Search and filter state of an exercise list, kept outside the screen so
 * coming back to the list (after opening an exercise) finds it unchanged.
 */
import type { Equipment, Muscle } from '../schema/common.ts';

/** Rows rendered at first and added each time the end of the list comes into view. */
export const BROWSE_PAGE_SIZE = 60;

export class BrowseState {
  query = $state('');
  muscles = $state<Muscle[]>([]);
  equipment = $state<Equipment[]>([]);
  /** How many results are rendered. */
  limit = $state(BROWSE_PAGE_SIZE);

  get filtered(): boolean {
    return this.muscles.length > 0 || this.equipment.length > 0;
  }

  toggleMuscle(muscle: Muscle): void {
    this.muscles = this.muscles.includes(muscle)
      ? this.muscles.filter((m) => m !== muscle)
      : [...this.muscles, muscle];
    this.limit = BROWSE_PAGE_SIZE;
  }

  toggleEquipment(equipment: Equipment): void {
    this.equipment = this.equipment.includes(equipment)
      ? this.equipment.filter((e) => e !== equipment)
      : [...this.equipment, equipment];
    this.limit = BROWSE_PAGE_SIZE;
  }

  setQuery(query: string): void {
    this.query = query;
    this.limit = BROWSE_PAGE_SIZE;
  }

  clearFilters(): void {
    this.muscles = [];
    this.equipment = [];
    this.limit = BROWSE_PAGE_SIZE;
  }

  reset(): void {
    this.query = '';
    this.clearFilters();
  }
}

/** The Exercises tab. */
export const exercisesBrowse = new BrowseState();
/** The exercise picker of the plan editor. */
export const pickerBrowse = new BrowseState();
