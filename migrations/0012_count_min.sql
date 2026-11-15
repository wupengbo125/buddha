-- 次数型发愿的「最少坚持」单位是声：把仍是旧默认值 300（原本沿用时长模式默认）的归一到 100 声。
UPDATE practices SET min_seconds = 100 WHERE target_kind = 'count' AND min_seconds = 300;
