package com.caja.shared.money;

/** Colombian pesos as a whole number of pesos. Never use float or double for money. */
public record Pesos(long value) {
  public Pesos plus(Pesos other) {
    return new Pesos(Math.addExact(value, other.value));
  }

  public Pesos minus(Pesos other) {
    return new Pesos(Math.subtractExact(value, other.value));
  }

  public boolean isNegative() {
    return value < 0;
  }
}
