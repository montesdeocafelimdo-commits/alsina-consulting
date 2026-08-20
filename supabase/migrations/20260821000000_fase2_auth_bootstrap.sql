-- ════════════════════════════════════════════════════
-- ALSINA — FASE 2: bootstrap de identidad (AD-04, AD-06)
-- Aditiva. No modifica contacts/unlocks/subscriptions(vieja)/purchases.
-- ════════════════════════════════════════════════════

-- Al crearse un usuario en auth.users (alta por magic link), se crea
-- automáticamente: profile, cuenta personal (1:1, AD-06), suscripción
-- Concejal activa con el precio de fundador vigente, y los entitlements
-- que correspondan según plan_features. Todo en una sola transacción —
-- es el flujo completo de AD-04 (pasos 3 a 6), sin red, sin depender de
-- que un segundo request del backend se ejecute después.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_concejal_plan_id uuid;
  v_price_id uuid;
  v_subscription_id uuid;
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.accounts (owner_profile_id)
  values (new.id)
  on conflict (owner_profile_id) do nothing
  returning id into v_account_id;

  if v_account_id is null then
    select id into v_account_id from public.accounts where owner_profile_id = new.id;
  end if;

  select id into v_concejal_plan_id from public.plans where slug = 'concejal';

  select id into v_price_id
  from public.plan_prices
  where plan_id = v_concejal_plan_id
    and is_founder = true
    and available_for_new_signups = true
  order by effective_from desc
  limit 1;

  if v_price_id is null then
    -- Sin versión de precio de fundador disponible: cae al precio de
    -- lista más reciente del plan (no debería pasar en operación normal,
    -- pero nunca dejar la suscripción sin price_id).
    select id into v_price_id
    from public.plan_prices
    where plan_id = v_concejal_plan_id
    order by effective_from desc
    limit 1;
  end if;

  insert into public.subscriptions (account_id, plan_id, price_id, status, current_period_start)
  values (v_account_id, v_concejal_plan_id, v_price_id, 'active', now())
  returning id into v_subscription_id;

  -- Entitlements derivados del plan Concejal — mismo cálculo que
  -- recalculate_entitlements() (abajo), pero inline para no depender de
  -- una segunda llamada en el alta.
  insert into public.entitlements (account_id, feature_id, level, source, source_id, valid_from)
  select v_account_id, pf.feature_id, pf.level, 'plan', v_subscription_id, now()
  from public.plan_features pf
  where pf.plan_id = v_concejal_plan_id
  on conflict (account_id, feature_id, source, source_id) do nothing;

  insert into public.email_preferences (account_id, editorial_opt_in)
  values (v_account_id, true)
  on conflict (account_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

comment on function public.handle_new_auth_user() is
  'AD-04: alta única — profile + cuenta personal + suscripción Concejal (precio fundador) + entitlements + preferencia editorial, todo atómico al crearse el usuario de Auth.';

-- ── RECÁLCULO DE ENTITLEMENTS (AD-19, paso 8 del prompt maestro) ──────
-- Se llama cada vez que cambia el plan/estado de una suscripción (upgrade,
-- downgrade, cancelación, suspensión). Reemplaza los entitlements
-- source='plan' de esa cuenta por los del plan/estado vigente. Los
-- entitlements source='manual_grant' (accesos manuales) nunca se tocan acá.
create or replace function public.recalculate_plan_entitlements(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_plan_id uuid;
  v_active_subscription_id uuid;
begin
  -- Solo una suscripción "vigente" por cuenta debería estar en un estado
  -- que otorga acceso — activa, en gracia (todavía con acceso), o
  -- cancelación programada (todavía con acceso hasta paid_through).
  select s.plan_id, s.id
  into v_active_plan_id, v_active_subscription_id
  from public.subscriptions s
  where s.account_id = p_account_id
    and s.status in ('active', 'past_due', 'grace_period', 'cancel_at_period_end')
  order by
    case s.status
      when 'active' then 1
      when 'grace_period' then 2
      when 'past_due' then 3
      when 'cancel_at_period_end' then 4
    end
  limit 1;

  -- Sin ninguna suscripción con acceso vigente: cae a Concejal (nunca
  -- deja una cuenta sin ningún entitlement por accidente).
  if v_active_plan_id is null then
    select id into v_active_plan_id from public.plans where slug = 'concejal';
  end if;

  delete from public.entitlements
  where account_id = p_account_id and source = 'plan';

  insert into public.entitlements (account_id, feature_id, level, source, source_id, valid_from)
  select p_account_id, pf.feature_id, pf.level, 'plan', v_active_subscription_id, now()
  from public.plan_features pf
  where pf.plan_id = v_active_plan_id
  on conflict (account_id, feature_id, source, source_id) do nothing;
end;
$$;

comment on function public.recalculate_plan_entitlements(uuid) is
  'AD-19 / prompt maestro paso 8. Llamar después de todo cambio de status/plan_id en subscriptions. Nunca toca entitlements source=manual_grant.';
