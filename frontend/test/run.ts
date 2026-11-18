import { runAll } from './harness';
import './core.test';
import './user-accounts.test';
import './pricing.test';
import './support.test';
import './zenpos-price-book.test';
import './price-book-import.test';
import './price-books.test';
import './pricing-storage.test';
import './sales-report.test';
import './price-match.test';
import './sales-import.test';
import './sample-export.test';

void runAll();
