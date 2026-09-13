-- One kitchen per account. The landing form updates this row;
-- it should never create a second restaurant for the same owner.
create unique index if not exists restaurants_owner_key on restaurants (owner_id);
