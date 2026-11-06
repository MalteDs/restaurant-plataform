package com.caja.shared.money;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MoneyTest {
  @Test void addsWithoutOverflow() {
    assertEquals(18500, new Pesos(16500).plus(new Pesos(2000)).value());
  }

  @Test void subtracts() {
    assertEquals(14500, new Pesos(16500).minus(new Pesos(2000)).value());
  }

  @Test void knowsWhenNegative() {
    assertTrue(new Pesos(-1).isNegative());
    assertFalse(new Pesos(0).isNegative());
  }

  @Test void plusRejectsOverflow() {
    assertThrows(ArithmeticException.class, () -> new Pesos(Long.MAX_VALUE).plus(new Pesos(1)));
  }

  @Test void minusRejectsOverflow() {
    assertThrows(ArithmeticException.class, () -> new Pesos(Long.MIN_VALUE).minus(new Pesos(1)));
  }
}
