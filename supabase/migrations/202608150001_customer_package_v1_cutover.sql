alter table orders add column if not exists customer_package_version text;

alter table orders drop constraint if exists orders_customer_package_version_check;
alter table orders add constraint orders_customer_package_version_check check (
  customer_package_version is null
  or (customer_package_version = 'customer-package-v1' and pipeline_version = 'semantic-v2')
);

create table if not exists pipeline_cutovers (
  version text primary key,
  pipeline_version text not null,
  cutover_at timestamptz not null default clock_timestamp(),
  notes text not null
);

alter table pipeline_cutovers enable row level security;
drop policy if exists "Service role manages pipeline cutovers" on pipeline_cutovers;
create policy "Service role manages pipeline cutovers" on pipeline_cutovers for all to service_role using (true) with check (true);

insert into pipeline_cutovers(version,pipeline_version,notes)
values('customer-package-v1','semantic-v2','Default for new orders only; existing orders remain unchanged; customer delivery requires explicit admin approval.')
on conflict(version) do nothing;
