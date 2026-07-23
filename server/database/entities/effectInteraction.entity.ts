import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** 用户对作品的互动记录（点赞 / 投币 / 收藏）。 */
@Entity({ name: 'effect_interactions' })
@Index('uq_effect_interactions_user_effect_kind', ['userId', 'effectId', 'kind'], {
  unique: true,
})
@Index('idx_effect_interactions_effect', ['effectId'])
export class EffectInteraction {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_effect_interactions',
  })
  id!: number

  @Column({ name: 'user_id', type: 'integer', nullable: false })
  userId!: number

  @Column({ name: 'effect_id', type: 'integer', nullable: false })
  effectId!: number

  @Column({ type: 'text', nullable: false })
  kind!: string // 'like' | 'coin' | 'favorite'

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date
}
