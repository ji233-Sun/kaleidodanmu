import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** 用户对作品的「收藏」关系（独立表）。 */
@Entity({ name: 'effect_favorites' })
@Index('uq_effect_favorites_user_effect', ['userId', 'effectId'], { unique: true })
@Index('idx_effect_favorites_effect', ['effectId'])
export class EffectFavorite {
  @PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName: 'pk_effect_favorites' })
  id!: number

  @Column({ name: 'user_id', type: 'integer', nullable: false })
  userId!: number

  @Column({ name: 'effect_id', type: 'integer', nullable: false })
  effectId!: number

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
