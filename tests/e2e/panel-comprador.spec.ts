import { test, expect } from '@playwright/test';
import { CUENTAS, entrar } from './ayudantes-sesion';

test.describe('E2E — Panel del Comprador (SP2)', () => {
  test('anónimo es redirigido a login al intentar entrar a /mi-cuenta', async ({ page }) => {
    await page.goto('/mi-cuenta');
    await expect(page).toHaveURL(/\/login/);
  });

  test('comprador autenticado navega por las secciones de /mi-cuenta', async ({ page }) => {
    await entrar(page, CUENTAS[0]); // comprador

    await page.goto('/mi-cuenta');
    await expect(page).toHaveURL(/\/mi-cuenta/);
    await expect(page.getByRole('heading', { name: /Panel del Comprador/i })).toBeVisible();

    // Comprobar pestañas de navegación
    await expect(page.getByRole('link', { name: /Solicitudes/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Favoritos/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Búsquedas guardadas/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Mis datos y privacidad/i })).toBeVisible();

    // Navegar a Favoritos
    await page.getByRole('link', { name: /Favoritos/i }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/favoritos/);
    await expect(page.getByRole('heading', { name: /Propiedades Favoritas/i })).toBeVisible();

    // Navegar a Búsquedas guardadas
    await page.getByRole('link', { name: /Búsquedas guardadas/i }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/busquedas/);
    await expect(page.getByRole('heading', { name: /Búsquedas Guardadas/i })).toBeVisible();

    // Navegar a Mis datos y privacidad
    await page.getByRole('link', { name: /Mis datos y privacidad/i }).click();
    await expect(page).toHaveURL(/\/mi-cuenta\/datos/);
    await expect(page.getByRole('heading', { name: /Mis Datos Personales/i })).toBeVisible();
  });

  test('comprador actualiza sus datos de contacto en /mi-cuenta/datos', async ({ page }) => {
    await entrar(page, CUENTAS[0]); // comprador

    await page.goto('/mi-cuenta/datos');
    await expect(page.getByRole('heading', { name: /Mis Datos Personales/i })).toBeVisible();

    const inputTelefono = page.getByPlaceholder(/3001234567/i);
    await inputTelefono.fill('3109876543');

    await page.getByRole('button', { name: /Actualizar datos/i }).click();
    await expect(page.getByText(/Datos actualizados correctamente/i)).toBeVisible();
  });

  test('comprador guarda una búsqueda desde el catálogo y la ve en /mi-cuenta/busquedas', async ({ page }) => {
    await entrar(page, CUENTAS[0]); // comprador

    // Ir al catálogo de un barrio con propiedades
    await page.goto('/alto-prado');

    // Botón para abrir modal de guardar búsqueda
    const botonGuardar = page.getByTestId('boton-guardar-busqueda');
    await expect(botonGuardar).toBeVisible();
    await botonGuardar.click();

    // Modal
    await expect(page.getByRole('heading', { name: /Guardar criterios de búsqueda/i })).toBeVisible();
    const nombreBusqueda = `Prueba E2E ${Date.now()}`;
    await page.getByPlaceholder(/Ej. Casas en Chapinero/i).fill(nombreBusqueda);
    await page.getByRole('button', { name: /^Guardar búsqueda$/i }).click();

    // Esperar mensaje de éxito
    await expect(page.getByText(/¡Búsqueda guardada con éxito!/i)).toBeVisible();

    // Verificar en /mi-cuenta/busquedas
    await page.goto('/mi-cuenta/busquedas');
    await expect(page.getByText(nombreBusqueda)).toBeVisible();
  });
});
