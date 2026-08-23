import { redirect } from 'next/navigation';

/** There is one thing here, so the front door leads straight to it. */
export default function Index() {
  redirect('/cups');
}
