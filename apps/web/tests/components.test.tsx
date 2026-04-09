import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

describe("UI components", () => {
  it("renders button text", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("fires input change events", () => {
    const onChange = vi.fn();
    render(<Input aria-label="matter-name" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("matter-name"), {
      target: { value: "NDA Matter" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("supports checkbox interactions", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="accept-terms" onCheckedChange={onCheckedChange} />);

    fireEvent.click(screen.getByLabelText("accept-terms"));

    expect(onCheckedChange).toHaveBeenCalled();
  });
});
