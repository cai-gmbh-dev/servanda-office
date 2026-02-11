import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ReactElement } from 'react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

function AllProviders({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

/**
 * Run axe-core accessibility checks on a container element.
 * Returns the jest-axe result for assertion with toHaveNoViolations().
 */
async function checkA11y(container: HTMLElement) {
  const results = await axe(container);
  return results;
}

export * from '@testing-library/react';
export { customRender as render, checkA11y, axe };
